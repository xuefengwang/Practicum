#!/usr/bin/env python3
from scapy.all import *
import os
import re
from pathlib import Path
import mysql.connector
import configparser
from datetime import datetime
import time
import ipaddress
load_layer("http")
# 6073372 max id as of 4:09 10/18
HOME = str(Path.home())
PCAP_FOLDER = "wlan0_pcap"
# PCAP_FOLDER = "Downloads/pcaps"
SKIPPED_PCAP = "skipped.pcap"
LOCAL_IP_REGEX = "10.20.1.[0-9]{1,3}"
db_conn = None
error_file = open("error.log", "w")


class DbPacket:
  def __init__(self):
    self.payload = None
    self.src_port = None
    self.dst_port = None
    self.src_ip = None
    self.dst_ip = None
  atime: str
  protocol: str
  src_ip: str
  src_port: int
  src_mac: str
  dst_ip: str
  dst_port: int
  dst_mac: str
  size: int
  payload: str

  def __repr__(self):
    return f"{self.atime} [{self.size} bytes]: {self.protocol} - {self.src_mac} => {self.dst_mac}, {self.src_ip} => {self.dst_ip}, {self.payload}"


def setup():
  global db_conn
  config = configparser.ConfigParser()
  config.read(os.path.join(HOME, "packet_parsing.ini"))
  db_config = dict(config.items('Database'))
  db_conn = mysql.connector.connect(**db_config)
  print(f"db conn: {db_conn.connection_id}")

# The captured pcap files are located at $HOME/wlan0_pcap folder.
# Any file in that folder is assumed to have not been processed.


def next_pcap_file():
  dir = os.path.join(HOME, PCAP_FOLDER)
  paths = sorted(Path(dir).iterdir(), key=os.path.getmtime)
  paths = [x for x in paths if os.path.isfile(x)]
  if len(paths) <= 1:       # last one is probably the one still being written
    print(f"no more available files, {paths}")
    return None
  return paths[0]


def create_pkt(pkt, protocol):
  db_pkt = DbPacket()
  db_pkt.atime = datetime.utcfromtimestamp(
      int(pkt.time)).strftime('%Y-%m-%d %H:%M:%S')  # arrival time
  db_pkt.protocol = protocol
  if pkt.haslayer(IP):
    db_pkt.src_ip = pkt[IP].src
    db_pkt.dst_ip = pkt[IP].dst
  db_pkt.src_mac = pkt[Ether].src
  db_pkt.dst_mac = pkt[Ether].dst
  db_pkt.size = pkt.wirelen
  return db_pkt


def parse_pkt(pkt):
  db_pkt = None
  # print(f"pkt: {pkt.summary()}")
  if pkt.haslayer(DNS):
    # print(f"DNS: {pkt[DNS].show()}")
    db_pkt = create_pkt(pkt, 'DNS')
    dns = pkt[DNS]
    if dns.qr == 1:       # DNS answer
      payload = ""
      for i in range(dns.ancount):
        an = dns[DNSRR][i]
        if an.type == 1:  # A record
          payload += f"{an.rrname, an.rdata}; "
      db_pkt.payload = payload
    elif dns.qr == 0:     # DNS question
      db_pkt.payload = dns[DNSQR].qname
    # print(f"{db_pkt}")
  elif pkt.haslayer(ARP):
    db_pkt = create_pkt(pkt, "ARP")
    arp = pkt[ARP]
    payload = None
    if arp.op == 1:
      payload = "Who has " + arp.pdst + "? Tell " + arp.psrc
    elif arp.op == 2:
      payload = arp.psrc + " is at " + arp.hwsrc
    else:
      print("Error: unsupported arp opcode")
    db_pkt.payload = payload
  else:
    # skip internal chat
    if pkt.haslayer(IP) and re.match(LOCAL_IP_REGEX, pkt[IP].src) and re.match(LOCAL_IP_REGEX, pkt[IP].dst):
      # print("local chat, skipped")
      pass
    elif pkt.haslayer(TCP):
      # print("TCP")
      protocol = "TCP"
      if pkt[TCP].sport == 443 or pkt[TCP].dport == 443:
        protocol = "TLS"
      elif pkt.haslayer(HTTP):
        protocol = "HTTP"
      db_pkt = create_pkt(pkt, protocol)
      db_pkt.src_port = pkt[TCP].sport
      db_pkt.dst_port = pkt[TCP].dport
      if pkt.haslayer(HTTP):
        db_pkt.payload = raw(pkt[HTTP]).decode('utf-8')
      elif pkt.haslayer(Raw):
        db_pkt.payload = str(pkt[Raw].load)
    elif pkt.haslayer(UDP):
      # print("UDP")
      db_pkt = create_pkt(pkt, 'UDP')
      db_pkt.src_port = pkt[UDP].sport
      db_pkt.dst_port = pkt[UDP].dport
      if pkt.haslayer(Raw):
        db_pkt.payload = str(pkt[Raw].load)
    else:
      print(f"Another protocol: {pkt.show()}")
      wrpcap(SKIPPED_PCAP, pkt, append=True)
      pass
  return db_pkt


def get_ip_coord(ip_address, ip_number, db_cursor):
  # print(f"get_ip_coord: {ip_address}")
  # check if it has already been looked up
  select_stmt = (
      "SELECT id FROM ip_coordinate "
      "WHERE ip_address = %s"
  )
  db_cursor.execute(select_stmt, (ip_address,))
  coord = db_cursor.fetchone()
  ip_coord_id = None
  if coord == None:
    select_stmt = (
        "SELECT latitude, longitude FROM ip_location WHERE ip_start < %s AND ip_end > %s"
    )
    db_cursor.execute(select_stmt, (ip_number, ip_number))
    lat_long = db_cursor.fetchone()
    if lat_long == None:
      error_file.write(f"Couldn't find coordinate for ip: {ip_address}.\n")
    else:
      insert_stmt = (
          "INSERT INTO ip_coordinate (ip_address, latitude, longitude) "
          "VALUES(%s, %s, %s)"
      )
      db_cursor.execute(insert_stmt, (ip_address, lat_long[0], lat_long[1]))
      ip_coord_id = db_cursor.lastrowid
  else:
    ip_coord_id = coord[0]
  return ip_coord_id


def add_pkt_to_db(db_pkt: DbPacket):
  if db_pkt == None:
    return
  db_cursor = db_conn.cursor()

  src_ip_number = None
  dst_ip_number = None
  src_ip_coord_id = None
  dst_ip_coord_id = None
  if db_pkt.src_ip is not None:
    # get ip location if src_ip or dst_ip is public ip address
    src_ip = ipaddress.IPv4Address(db_pkt.src_ip)
    dst_ip = ipaddress.IPv4Address(db_pkt.dst_ip)
    if not src_ip.is_private:
      src_ip_number = int(src_ip)
      src_ip_coord_id = get_ip_coord(db_pkt.src_ip, src_ip_number, db_cursor)
    elif not dst_ip.is_private:
      dst_ip_number = int(dst_ip)
      dst_ip_coord_id = get_ip_coord(db_pkt.dst_ip, dst_ip_number, db_cursor)

  insert_stmt = (
      "INSERT INTO packet (packet_time, protocol, src_ip, src_ip_number, src_ip_coord_id, src_port, src_mac, "
      "dst_ip, dst_ip_number, dst_ip_coord_id, dst_port, dst_mac, size, payload) "
      "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
  )
  db_payload = db_pkt.payload
  if db_payload:
    db_payload = db_payload[:1023]
  data = (db_pkt.atime, db_pkt.protocol, db_pkt.src_ip, src_ip_number, src_ip_coord_id, db_pkt.src_port, db_pkt.src_mac,
          db_pkt.dst_ip, dst_ip_number, dst_ip_coord_id, db_pkt.dst_port, db_pkt.dst_mac, db_pkt.size, db_payload)
  result = db_cursor.execute(insert_stmt, data)
  # print(f"db result {result}, {db_cursor.lastrowid}")
  db_conn.commit()
  # db_conn.rollback()


def process_pkt(pkt):
  try:
    db_pkt = parse_pkt(pkt)
    add_pkt_to_db(db_pkt)
    print(".", end='')
  except Exception as e:
    error_file.write(f"Error: {e}, packet: {pkt.summary()}\n\n")
    traceback.print_exc(file=error_file)
    wrpcap(SKIPPED_PCAP, pkt, append=True)


def clean_up(pcap_file):
  os.rename(pcap_file, os.path.join(
      HOME, PCAP_FOLDER, "processed", pcap_file.name))


setup()
while (True):
  pcap_file = next_pcap_file()
  if pcap_file == None:
    time.sleep(300)     # no more files to process, sleep 5 minutes
  else:
    print(f"processing {pcap_file}")
    sniff(offline=str(pcap_file), prn=process_pkt, store=0)
    clean_up(pcap_file)
    print("\n")
