#!/usr/bin/env python3
from scapy.all import *
import os
from pathlib import Path
import mysql.connector

HOME = str(Path.home())
PCAP_FOLDER = "wlan0_pcap"
db_conn

def connect_db():
  

# The captured pcap files are located at $HOME/wlan0_pcap folder. 
# Any file in that folder is assumed to have not been processed. 
def next_pcap_file():
  dir = os.path.join(HOME, PCAP_FOLDER)
  paths = sorted(Path(dir).iterdir(), key=os.path.getmtime)
  for p in paths:
    if os.path.isfile(p):
      return p

def parse_packet(pkt):
  print(pkt.summary())

def clean_up(pcap_file):
  os.rename(pcap_file, os.path.join(HOME, PCAP_FOLDER, "processed", pcap_file.name))

pcap_file = next_pcap_file()

print(f"processing {pcap_file}")
sniff(count=10, offline=str(pcap_file), prn=parse_packet, store=0)

clean_up(pcap_file)
