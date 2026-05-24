from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import numpy as np
import cv2
import requests
import os
import base64
from PIL import Image
import io
import json
from datetime import datetime

app = FastAPI(title="SurveillanceOS AI Service")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# NestJS API URL
NESTJS_API_URL = os.getenv("API_URL", "http://localhost:3000")

@app.get("/")
def health_check():
    return {
        "status": "running",
        "service": "SurveillanceOS AI Detection",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/detect")
async def detect_objects(
    file: UploadFile = File(...),
    camera_id: str = "",
    client_id: str = "",
    token: str = ""
):
    """
    Detect objects in an image frame.
    Returns detected objects with confidence scores.
    """
    try:
        # Read image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image")

        # Get image dimensions
        height, width = img.shape[:2]

        # Simple motion/object detection using basic CV
        detections = simple_detect(img)

        # If person detected and camera_id provided, create alert
        if any(d["class"] == "person" for d in detections) and camera_id:
            await create_alert(
                camera_id=camera_id,
                client_id=client_id,
                alert_type="PERSON_DETECTED",
                message=f"Person detected by AI service",
                confidence=max(d["confidence"] for d in detections if d["class"] == "person"),
                token=token
            )

        return {
            "success": True,
            "detections": detections,
            "image_size": {"width": width, "height": height},
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def simple_detect(img):
    """
    Simple object detection using OpenCV.
    In production this would use YOLOv8.
    """
    detections = []

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Load OpenCV's built-in face detector
    face_cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(face_cascade_path)

    # Detect faces (as proxy for person detection)
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30)
    )

    for (x, y, w, h) in faces:
        detections.append({
            "class": "person",
            "confidence": 0.85,
            "bbox": {
                "x": int(x),
                "y": int(y),
                "width": int(w),
                "height": int(h)
            }
        })

    return detections

async def create_alert(
    camera_id: str,
    client_id: str,
    alert_type: str,
    message: str,
    confidence: float,
    token: str
):
    """Send alert to NestJS API"""
    try:
        if not token:
            print("No token provided, skipping alert creation")
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        alert_data = {
            "type": alert_type,
            "severity": "HIGH",
            "message": message,
            "cameraId": camera_id,
            "clientId": client_id,
            "metadata": {
                "confidence": confidence,
                "detectedBy": "AI Service",
                "timestamp": datetime.now().isoformat()
            }
        }

        response = requests.post(
            f"{NESTJS_API_URL}/alerts",
            json=alert_data,
            headers=headers,
            timeout=5
        )

        print(f"Alert created: {response.status_code}")

    except Exception as e:
        print(f"Error creating alert: {e}")

@app.post("/detect/base64")
async def detect_from_base64(data: dict):
    """Detect objects from base64 encoded image"""
    try:
        image_data = data.get("image", "")
        camera_id = data.get("camera_id", "")

        # Decode base64
        if "," in image_data:
            image_data = image_data.split(",")[1]

        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image")

        detections = simple_detect(img)

        return {
            "success": True,
            "detections": detections,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )