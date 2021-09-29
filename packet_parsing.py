#!/usr/bin/env python3
from scapy.all import *
import os
from pathlib import Path

home = str(Path.home())
PCAP_FOLDER = "wlan0_pcap"

# The captured pcap files are located at $HOME/wlan0_pcap folder. 
# Any file in that folder is assumed to have not been processed. 
def next_pcap_file():
  dir = os.path.join(home, PCAP_FOLDER)
  paths = sorted(Path(dir).iterdir(), key=os.path.getmtime)
  for p in paths:
    if os.path.isfile(p):
      return p
    

def parse_packet(pkt):
  print(pkt.summary())

pcap_file = next_pcap_file()

print(f"processing {pcap_file}")
sniff(count=10, offline=str(pcap_file), prn=parse_packet, store=0)
