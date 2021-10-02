#!/usr/bin/env python3
from scapy.all import *
import os
from pathlib import Path
import mysql.connector
import configparser
from datetime import datetime
load_layer("http")

HOME = str(Path.home())
# PCAP_FOLDER = "wlan0_pcap"
PCAP_FOLDER = "Downloads/pcaps"
db_conn = None

class DbPacket:
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
  config.read("packet_parsing.ini")
  db_config = dict(config.items('Database'))
  db_conn = mysql.connector.connect(**db_config)
  print(f"db conn: {db_conn.connection_id}") 

# The captured pcap files are located at $HOME/wlan0_pcap folder. 
# Any file in that folder is assumed to have not been processed. 
def next_pcap_file():
  dir = os.path.join(HOME, PCAP_FOLDER)
  paths = sorted(Path(dir).iterdir(), key=os.path.getmtime)
  for p in paths:
    if os.path.isfile(p):
      return p

def parse_packet(pkt):
  db_pkt = DbPacket()
  print(pkt.summary())
  if pkt.haslayer(DNS):
    # print(f"DNS: {pkt[DNS].show()}")
    db_pkt.atime = datetime.utcfromtimestamp(int(pkt.time)).strftime('%Y-%m-%d %H:%M:%S')  # arrival time
    db_pkt.protocol = "DNS"
    db_pkt.src_ip = pkt[IP].src
    db_pkt.src_mac = pkt[Ether].src
    db_pkt.dst_ip = pkt[IP].dst
    db_pkt.dst_mac = pkt[Ether].dst
    db_pkt.size = pkt.len
    dns = pkt[DNS]
    if dns.qr == 1:   # DNS answer
      payload = ""
      for i in range(dns.ancount):
        an = dns[DNSRR][i]
        if an.type == 1: # A record
          payload += f"{an.rrname, an.rdata}; "
      db_pkt.payload = payload
    elif dns.qr == 0:   # DNS question
      db_pkt.payload = dns[DNSQR].qname
    print(f"{db_pkt}")
  elif pkt.haslayer(ARP):
    print(f"ARP: passed")
    pass
  elif pkt.haslayer(TCP):
    print("TCP")
  elif pkt.haslayer(HTTP):
    print("HTTP")
  elif pkt.haslayer(ICMP):
    print("ICMP")
  else:
    print(f"Another protocol: {pkt.show()}")

def clean_up(pcap_file):
  os.rename(pcap_file, os.path.join(HOME, PCAP_FOLDER, "processed", pcap_file.name))

# setup()
pcap_file = next_pcap_file()

print(f"processing {pcap_file}")
sniff(count=12, offline=str(pcap_file), prn=parse_packet, store=0)

# clean_up(pcap_file)
