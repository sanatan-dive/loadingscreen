import base64, json, os, sys, time, urllib.request, io
import cv2, numpy as np
from PIL import Image

KEY = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("openrouter")
CASC = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

def face_rect(bgr):
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    f = CASC.detectMultiScale(g, 1.1, 5, minSize=(40,40))
    return None if len(f)==0 else max(f, key=lambda r: r[2]*r[3])

def head_box(bgr, padx=1.6, up=1.45, down=1.75):
    r = face_rect(bgr)
    if r is None: return None
    x,y,w,h = r; cx,cy = x+w/2, y+h/2
    X0=max(0,int(cx-w*padx/2)); X1=min(bgr.shape[1],int(cx+w*padx/2))
    Y0=max(0,int(cy-h*up/2*1.3)); Y1=min(bgr.shape[0],int(cy+h*down/2*1.6))  # extra down = neck
    return X0,Y0,X1,Y1

PROMPT=("The FIRST image is a crop of a man's head and neck. Replace his face, hair and neck skin with those of "
 "the man in the SECOND image so it is clearly the same person as the second image. Keep the head at the same "
 "angle and roughly the same position and scale. Keep the collar, clothing and background of the crop unchanged. "
 "Match the lighting direction, colour temperature and photographic grain of the first image. Skin tone must be "
 "consistent across face and neck. Photorealistic. No text.")

def call(model, crop_png, face_png):
    body={"model":model,"modalities":["image","text"],"messages":[{"role":"user","content":[
        {"type":"text","text":PROMPT},
        {"type":"image_url","image_url":{"url":"data:image/png;base64,"+base64.b64encode(crop_png).decode()}},
        {"type":"image_url","image_url":{"url":"data:image/png;base64,"+base64.b64encode(face_png).decode()}}]}]}
    req=urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",data=json.dumps(body).encode(),
        headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    t0=time.time()
    with urllib.request.urlopen(req,timeout=300) as r: d=json.load(r)
    if "error" in d: print("   ERR",str(d["error"])[:200]); return None,0,0
    imgs=d["choices"][0]["message"].get("images") or []
    if not imgs: return None,0,0
    return base64.b64decode(imgs[0]["image_url"]["url"].split(",",1)[1]), time.time()-t0, d.get("usage",{}).get("cost",0)

def align(new, crop):
    """scale+translate `new` so its face rect lands on crop's face rect. no stretching."""
    rc, rn = face_rect(crop), face_rect(new)
    ch,cw = crop.shape[:2]
    if rc is None or rn is None:
        return cv2.resize(new,(cw,ch),interpolation=cv2.INTER_LANCZOS4), False
    s = ((rc[2]/rn[2]) + (rc[3]/rn[3]))/2                      # uniform scale, preserves proportions
    M = np.float32([[s,0, (rc[0]+rc[2]/2) - s*(rn[0]+rn[2]/2)],
                    [0,s, (rc[1]+rc[3]/2) - s*(rn[1]+rn[3]/2)]])
    return cv2.warpAffine(new, M, (cw,ch), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE), True

def mask(w,h,inset=0.06,blur=0.16):
    m=np.zeros((h,w),np.float32)
    cv2.ellipse(m,(w//2,int(h*0.47)),(int(w*(0.5-inset)),int(h*(0.5-inset))),0,0,360,1.0,-1)
    k=int(max(w,h)*blur)|1
    return cv2.GaussianBlur(m,(k,k),0)[...,None]

def run(frame, facep, model, out):
    bgr=cv2.imread(frame); box=head_box(bgr)
    if not box: print("  no face in frame"); return None
    X0,Y0,X1,Y1=box; crop=bgr[Y0:Y1,X0:X1]; ch,cw=crop.shape[:2]
    raw,el,cost=call(model, cv2.imencode('.png',crop)[1].tobytes(), open(facep,'rb').read())
    if raw is None: print("  no image"); return None
    new=cv2.cvtColor(np.array(Image.open(io.BytesIO(raw)).convert("RGB")),cv2.COLOR_RGB2BGR)
    aligned,ok=align(new,crop)
    m=mask(cw,ch)
    blended=(aligned*m + crop*(1-m)).astype(np.uint8)
    o=bgr.copy(); o[Y0:Y1,X0:X1]=blended; cv2.imwrite(out,o)
    print(f"  box {cw}x{ch} | model {new.shape[1]}x{new.shape[0]} | align={'face-matched' if ok else 'FALLBACK stretch'} | {el:.1f}s ${cost:.4f} -> {out}")
    return out

if __name__=="__main__": run(*sys.argv[1:5])
