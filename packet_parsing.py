#!/usr/bin/env python3
from scapy.all import *
from pathlib import Path
home = str(Path.home())

def parse_packet(pkt):
    print(pkt.summary())

sniff(offline=f'{home}/wlan0_pcap/wlan0_2021-09-28_21.32.47.pcap', prn=parse_packet, store=0)
