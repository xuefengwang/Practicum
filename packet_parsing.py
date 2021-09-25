#!/usr/bin/env python3
from scapy.all import *
from pathlib import Path
home = str(Path.home())

def parse_packet(pkt):
    print(pkt.summary())

sniff(count=1, offline=f'{home}/Downloads/wlan0.pcap', prn=parse_packet, store=0)
