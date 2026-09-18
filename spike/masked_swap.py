import base64, json, os, sys, time, urllib.request, io
import cv2, numpy as np
from PIL import Image

KEY = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("openrouter")
CASCADE = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

def detect_head(bgr, pad=1.5):
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    faces = cv2.CascadeClassifier(CASCADE).detectMultiScale(g, 1.1, 5, minSize=(60,60))
    if len(faces)==0: return None
    x,y,w,h = max(faces, key=lambda f: f[2]*f[3])
    cx, cy = x+w/2, y+h/2
    nw, nh = w*pad, h*pad*1.25          # extra vertical for hair + chin
    X0 = max(0, int(cx-nw/2)); Y0 = max(0, int(cy-nh/2*1.05))
    X1 = min(bgr.shape[1], int(cx+nw/2)); Y1 = min(bgr.shape[0], int(cy+nh/2*0.95))
    return X0,Y0,X1,Y1

def durl_bytes(b, mt="image/png"):
    return f"data:{mt};base64," + base64.b64encode(b).decode()

PROMPT = (
 "The FIRST image is a tight crop of a man's head on a red carpet. Replace his face and hair with the face "
 "and hair of the man in the SECOND image, so it is clearly the same person as the second image.\n"
 "CRITICAL: keep the head in EXACTLY the same position, at EXACTLY the same scale, at the same angle, and "
 "keep the output the SAME WIDTH AND HEIGHT as the first image. Do not zoom. Do not recrop. Do not move the head.\n"
 "Keep the background of the crop and the shoulders/collar exactly as they are. Match the lighting direction, "
 "colour temperature and photographic grain of the first image. Photorealistic. No text."
)

def call(model, crop_png, face_png):
    body={"model":model,"modalities":["image","text"],"messages":[{"role":"user","content":[
        {"type":"text","text":PROMPT},
        {"type":"image_url","image_url":{"url":durl_bytes(crop_png)}},
        {"type":"image_url","image_url":{"url":durl_bytes(face_png)}}]}]}
    req=urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    t0=time.time()
    with urllib.request.urlopen(req,timeout=300) as r: d=json.load(r)
    if "error" in d: print("ERR",str(d["error"])[:300]); return None,0,0
    imgs=d["choices"][0]["message"].get("images") or []
    if not imgs: print("no image"); return None,0,0
    raw=base64.b64decode(imgs[0]["image_url"]["url"].split(",",1)[1])
    return raw, time.time()-t0, d.get("usage",{}).get("cost",0)

def feather_mask(w,h,inset=0.12,blur=0.10):
    m=np.zeros((h,w),np.float32)
    ax,ay=int(w*(0.5-inset)), int(h*(0.5-inset))
    cv2.ellipse(m,(w//2,h//2),(ax,ay),0,0,360,1.0,-1)
    k=int(max(w,h)*blur)|1
    return cv2.GaussianBlur(m,(k,k),0)[...,None]

def run(frame_path, face_path, model, out_path):
    bgr=cv2.imread(frame_path); H,W=bgr.shape[:2]
    box=detect_head(bgr)
    if not box: print("NO FACE DETECTED in",frame_path); return None
    X0,Y0,X1,Y1=box
    crop=bgr[Y0:Y1, X0:X1]
    ch,cw=crop.shape[:2]
    print(f"  frame {W}x{H}  head box=({X0},{Y0})-({X1},{Y1}) = {cw}x{ch}")
    crop_png=cv2.imencode('.png',crop)[1].tobytes()
    face_png=open(face_path,'rb').read()
    raw,el,cost=call(model,crop_png,face_png)
    if raw is None: return None
    new=cv2.cvtColor(np.array(Image.open(io.BytesIO(raw)).convert("RGB")),cv2.COLOR_RGB2BGR)
    print(f"  model returned {new.shape[1]}x{new.shape[0]} -> resizing to {cw}x{ch}  ({el:.1f}s, ${cost:.4f})")
    new=cv2.resize(new,(cw,ch),interpolation=cv2.INTER_LANCZOS4)
    m=feather_mask(cw,ch)
    blended=(new*m + crop*(1-m)).astype(np.uint8)
    outimg=bgr.copy(); outimg[Y0:Y1, X0:X1]=blended
    cv2.imwrite(out_path,outimg)
    print(f"  wrote {out_path}  {outimg.shape[1]}x{outimg.shape[0]}")
    return out_path

if __name__=="__main__":
    run(sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4])
