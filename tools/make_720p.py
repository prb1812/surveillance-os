import cv2

src = "videos/test_video.mp4"
dst = "videos/test_720p.mp4"
seconds = 60

cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS) or 25
out = cv2.VideoWriter(dst, cv2.VideoWriter_fourcc(*"mp4v"), fps, (1280, 720))

n = 0
while n < fps * seconds:
    ok, frame = cap.read()
    if not ok:
        break
    out.write(cv2.resize(frame, (1280, 720)))
    n += 1

out.release()
cap.release()
print("frames written:", n)