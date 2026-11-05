from .subfinder import SubfinderAdapter
from .httpx import HttpxAdapter
from .nmap import NmapAdapter
from .nuclei import NucleiAdapter
REGISTRY={'subfinder':SubfinderAdapter,'httpx':HttpxAdapter,'nmap':NmapAdapter,'nuclei':NucleiAdapter}
