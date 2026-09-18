"""Smile metric from YuNet's 5 landmarks (eyes, nose, 2 mouth corners)."""
import numpy as np
from identity import detect

def landmarks(bgr):
    fs = detect(bgr)
    if not fs: return None
    f = fs[0]
    return dict(reye=np.array(f[4:6],float), leye=np.array(f[6:8],float),
                nose=np.array(f[8:10],float), rmouth=np.array(f[10:12],float),
                lmouth=np.array(f[12:14],float))

def smile(bgr):
    lm = landmarks(bgr)
    if lm is None: return None
    eye = np.linalg.norm(lm['leye']-lm['reye'])
    if eye == 0: return None
    width = np.linalg.norm(lm['lmouth']-lm['rmouth']) / eye          # smile widens mouth
    mid   = (lm['lmouth']+lm['rmouth'])/2
    eyemid= (lm['leye']+lm['reye'])/2
    drop  = np.linalg.norm(mid-eyemid) / eye                          # mouth-to-eye distance
    # corner lift: are corners higher (smaller y) than mouth midline vs nose axis
    lift  = float(((lm['lmouth'][1]+lm['rmouth'][1])/2 - lm['nose'][1]) / eye)
    return dict(width=float(width), drop=float(drop), lift=lift)
