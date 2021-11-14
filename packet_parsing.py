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

log_file = open("console.log", "w")


def log(msg):
  log_file.write(f"{datetime.utcnow()} - {msg}\n")
  log_file.flush()


class DbPacket:
  def __init__(self) -> None:
    self.payload = None
    self.src_port = None
    self.dst_port = None
    self.src_ip = None
    self.dst_ip = None
  atime: str
  time: int
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


# a local cache to aggregate data, for every 10 seconds, same src, dst ip and protocol will consolidate with bytes accumulated
class PacketCache:
  def __init__(self) -> None:
    self.packets = []
    self.time = None
  time: int
  packets: list

  def add_packet(self, pkt):
    if self.time is None:
      self.time = pkt.time
      self.packets.append(pkt)
    elif pkt.time - self.time < 10:   # flush every 10 seconds
      found = False
      for p in self.packets:
        if p.protocol == pkt.protocol and p.src_ip == pkt.src_ip and p.dst_ip == pkt.dst_ip:
          # log(f"same src, dst, and protocol, {pkt}, {p}")
          found = True
          p.size += pkt.size
          # log(f"new size: ${p}")
          break
      if not found:
        self.packets.append(pkt)
    else:
      log(f"flush {pkt.time}, {self.time}, {len(self.packets)}")
      log(".")
      for p in self.packets:
        add_pkt_to_db(p)
      self.time = pkt.time
      self.packets = [pkt]

  def __repr__(self):
    return f"local cache: {self.time} {self.packets}"


HOME = str(Path.home())
SKIPPED_PCAP = "skipped.pcap"
LOCAL_IP_REGEX = "10.20.1.[0-9]{1,3}"
db_conn = None
local_cache = PacketCache()
device_cache = []  # list of device ips


def load_device_cache():
  db_cursor = db_conn.cursor()
  select_stmt = (
      "SELECT ip_addr FROM device ORDER BY id"
  )
  db_cursor.execute(select_stmt)
  ips = db_cursor.fetchall()
  for ip in ips:
    device_cache.append(ip[0])
  db_cursor.close()
  log(f"device ips {device_cache}")


def setup():
  global db_conn
  config = configparser.ConfigParser()
  config.read(os.path.join(HOME, "packet_parsing.ini"))
  db_config = dict(config.items('Database'))
  db_conn = mysql.connector.connect(**db_config)
  log(f"db conn: {db_conn.connection_id}")
  load_device_cache()


def add_device(ip, pkt):
  if ip not in device_cache:
    device_cache.append(ip)
    db_cursor = db_conn.cursor()
    insert_stmt = (
        "INSERT INTO device (mac_addr, ip_addr) "
        "VALUES (%s, %s)"
    )
    db_cursor.execute(insert_stmt, (pkt[Ether].src, ip))
    db_conn.commit()
    db_cursor.close()


def create_pkt(pkt, protocol):
  db_pkt = DbPacket()
  db_pkt.time = int(pkt.time)
  db_pkt.atime = datetime.utcfromtimestamp(
      db_pkt.time).strftime('%Y-%m-%d %H:%M:%S')  # arrival time
  db_pkt.protocol = protocol
  if pkt.haslayer(IP):
    db_pkt.src_ip = pkt[IP].src
    db_pkt.dst_ip = pkt[IP].dst
  db_pkt.src_mac = pkt[Ether].src
  db_pkt.dst_mac = pkt[Ether].dst
  db_pkt.size = len(pkt)
  return db_pkt


def parse_pkt(pkt):
  db_pkt = None
  # log(f"pkt: {pkt.summary()}")
  if pkt.haslayer(IP) and re.match(LOCAL_IP_REGEX, pkt[IP].src):
    add_device(pkt[IP].src, pkt)
  if pkt.haslayer(DNS):
    # log(f"DNS: {pkt[DNS].show()}")
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
    # log(f"{db_pkt}")
  elif pkt.haslayer(ARP):
    db_pkt = create_pkt(pkt, "ARP")
    arp = pkt[ARP]
    payload = None
    if arp.op == 1:
      payload = "Who has " + arp.pdst + "? Tell " + arp.psrc
    elif arp.op == 2:
      payload = arp.psrc + " is at " + arp.hwsrc
    else:
      log("Error: unsupported arp opcode")
    db_pkt.payload = payload
  else:
    # skip internal chat
    if pkt.haslayer(IP) and ipaddress.IPv4Address(pkt[IP].src).is_private and ipaddress.IPv4Address(pkt[IP].dst).is_private:
      # log("local chat, skipped")
      pass
    elif pkt.haslayer(TCP):
      protocol = "TCP"
      if pkt[TCP].sport == 443 or pkt[TCP].dport == 443:
        protocol = "TLS"
      elif pkt.haslayer(HTTP):
        protocol = "HTTP"
      db_pkt = create_pkt(pkt, protocol)
      db_pkt.src_port = pkt[TCP].sport
      db_pkt.dst_port = pkt[TCP].dport
      if pkt.haslayer(HTTP):
        db_pkt.payload = bytes_hex(pkt[HTTP])
      elif pkt.haslayer(Raw):
        db_pkt.payload = str(pkt[Raw].load)
    elif pkt.haslayer(UDP):
      db_pkt = create_pkt(pkt, 'UDP')
      db_pkt.src_port = pkt[UDP].sport
      db_pkt.dst_port = pkt[UDP].dport
      if pkt.haslayer(Raw):
        db_pkt.payload = str(pkt[Raw].load)
    else:
      log(f"Another protocol: {pkt.summary()}")
      wrpcap(SKIPPED_PCAP, pkt, append=True)
      pass
  return db_pkt


def get_ip_coord(ip_address, ip_number, db_cursor):
  # log(f"get_ip_coord: {ip_address}")
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
        "SELECT id, latitude, longitude FROM ip_location WHERE ip_start < %s AND ip_end > %s"
    )
    db_cursor.execute(select_stmt, (ip_number, ip_number))
    lat_long = db_cursor.fetchone()
    if lat_long == None:
      log(f"ERROR: Couldn't find coordinate for ip: {ip_address}.")
    else:
      insert_stmt = (
          "INSERT INTO ip_coordinate (ip_address, latitude, longitude, ip_location_id) "
          "VALUES(%s, %s, %s, %s)"
      )
      db_cursor.execute(
          insert_stmt, (ip_address, lat_long[1], lat_long[2], lat_long[0]))
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
  # log(f"db result {result}, {db_cursor.lastrowid}")
  db_conn.commit()
  db_cursor.close()


def parse_dns_answer(dns_answer):
  data = []
  entries = dns_answer.rstrip().split(";")
  for entry in entries:
    mapping = entry.split(",")
    if len(mapping) == 2:
      m = re.search("\'(.*)\'", mapping[0])
      if m:
        name = m.group(1)
      n = re.search("\'(.*)\'", mapping[1])
      if n:
        ip = n.group(1)
      data.append((ip, name))
  # log(f"dns entries: {data}")
  return data


def add_dns(pkt):
  if pkt.src_ip == '10.20.1.1' and pkt.payload != '':   # DNS answer
    data = parse_dns_answer(pkt.payload)

    insert_stmt = (
        "INSERT IGNORE INTO dns (ip, name) "
        "VALUES (%s, %s)"
    )
    db_cursor = db_conn.cursor()
    db_cursor.executemany(insert_stmt, data)
    db_conn.commit()
    db_cursor.close()


def check_whitelist(pkt):
  db_cursor = db_conn.cursor()
  select_stmt = (
      "SELECT COUNT(*) total FROM device_whitelist "
      "WHERE device_ip = %s AND dest_ip = %s"
  )
  db_cursor.execute(select_stmt, (pkt.src_ip, pkt.dst_ip))
  total = db_cursor.fetchone()
  if total[0] == 0:
    log(f"Alert: device {pkt.src_ip} -> {pkt.dst_ip}")
    insert_alert = (
        "INSERT INTO alert (device_ip, message) VALUES (%s, %s)"
    )
    db_cursor.execute(
        insert_alert, (pkt.src_ip, f"IoT device {pkt.src_ip} is trying to contact {pkt.dst_ip} which has not been vistied before."))
    db_conn.commit()
    db_cursor.close()

def process_pkt(pkt):
  try:
    db_pkt = parse_pkt(pkt)
    if db_pkt is not None:
      local_cache.add_packet(db_pkt)
      if db_pkt.protocol == 'DNS':
        add_dns(db_pkt)
      if db_pkt.src_ip in device_cache:
        check_whitelist(db_pkt)
  except Exception as e:
    log(f"ERROR: {e}, packet: {pkt.summary()}")
    traceback.print_exc(file=log_file)
    wrpcap(SKIPPED_PCAP, pkt, append=True)


setup()

log("Start sniffing on wlan0...")
try:
  sniff(iface='wlan0', prn=process_pkt)
except Exception as e:
  log(f"ERROR: {e}")
  traceback.print_exc(file=log_file)

