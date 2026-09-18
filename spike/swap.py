import base64, json, os, sys, urllib.request, mimetypes, time

KEY = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("openrouter")
if not KEY: sys.exit("no key")

def durl(p):
    mt = mimetypes.guess_type(p)[0] or "image/png"
    return f"data:{mt};base64," + base64.b64encode(open(p,'rb').read()).decode()

PROMPT = (
 "Take the FIRST image. Replace ONLY the man's face and head with the face and head of the man "
 "in the SECOND image, so it is clearly the same person as the second image.\n"
 "Keep absolutely everything else pixel-identical to the first image: the exact same jacket, the same "
 "white collared shirt, the same grey step-and-repeat backdrop with the YouTube logos and wordmarks, "
 "the same lighting direction and colour temperature, the same body pose and shoulders, the same camera "
 "angle, the same crop and framing, the same image dimensions.\n"
 "Blend the new face naturally: match skin tone consistently across the face, neck and any visible skin so "
 "there is no visible seam or tone mismatch. Keep it photorealistic with the same photographic grain and "
 "depth of field as the first image. Do not add text. Do not change the background."
)

def swap(frame, face, model, out):
    body = {
      "model": model,
      "modalities": ["image","text"],
      "messages": [{"role":"user","content":[
          {"type":"text","text":PROMPT},
          {"type":"image_url","image_url":{"url":durl(frame)}},
          {"type":"image_url","image_url":{"url":durl(face)}},
      ]}],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    t0=time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    el=time.time()-t0
    if "error" in d: print("ERROR:", json.dumps(d["error"])[:400]); return None
    msg = d["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print("no image returned. text:", (msg.get("content") or "")[:300]); return None
    u = imgs[0]["image_url"]["url"]
    open(out,'wb').write(base64.b64decode(u.split(",",1)[1]))
    usage=d.get("usage",{})
    print(f"  OK {out}  {el:.1f}s  usage={usage.get('total_tokens','?')}tok cost=${usage.get('cost','?')}")
    return out

if __name__=="__main__":
    swap(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
