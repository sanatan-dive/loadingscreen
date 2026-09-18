"""Face detection + identity embedding. THREAD-SAFE: cv2 detector/recognizer
objects hold mutable input-size state, so each thread gets its own instances."""
import cv2, os, threading

MDL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
SAME = 0.363          # SFace cosine threshold for "same identity"
_local = threading.local()

def _d():
    if not hasattr(_local, "det"):
        _local.det = cv2.FaceDetectorYN.create(os.path.join(MDL,"yunet.onnx"), "", (320,320), 0.6, 0.3, 5000)
    return _local.det

def _r():
    if not hasattr(_local, "rec"):
        _local.rec = cv2.FaceRecognizerSF.create(os.path.join(MDL,"sface.onnx"), "")
    return _local.rec

def detect(bgr):
    h, w = bgr.shape[:2]
    det = _d(); det.setInputSize((w, h))
    n, f = det.detect(bgr)
    if f is None or len(f) == 0: return []
    return sorted(f, key=lambda r: -(r[2]*r[3]))

def embed(bgr, face_row=None):
    fs = detect(bgr) if face_row is None else [face_row]
    if not fs: return None
    rec = _r()
    return rec.feature(rec.alignCrop(bgr, fs[0]))

def cosine(a, b):
    if a is None or b is None: return float('nan')
    return float(_r().match(a, b, cv2.FaceRecognizerSF_FR_COSINE))
