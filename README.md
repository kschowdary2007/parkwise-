# ParkWise

ParkWise is the existing React/Vite parking application with a FastAPI and SQLAlchemy backend. Vehicle detection is available at **Vehicle Detection** in the sidebar and uses the configured Ultralytics YOLO weights; it does not substitute sample values for missing inference or evaluation results.

## Run the application

1. Install backend requirements in the backend environment:

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. Configure `backend/.env` with the database URL already used by your installation. Set the YOLO options described below when weights, labeled data, or camera streams are available. The backend creates the two new AI tables on startup and leaves existing tables and records intact.

3. Start the API from `backend/`:

   ```bash
   uvicorn app.main:app --reload
   ```

4. In another terminal, install frontend dependencies if needed and start Vite:

   ```bash
   npm install
   npm run dev
   ```

   Open the Vite URL and sign in using the existing ParkWise account.

   During local development, Vite proxies `/api` and `/ws` requests to the backend at `127.0.0.1:8000`. For a deployed frontend, configure the web server to proxy those paths to the API, or set `VITE_API_URL` and `VITE_WS_URL` to the reachable API and WebSocket URLs before building.

## YOLO configuration

Install the requirements before using detection. The large COCO benchmark downloads and YOLO weights under `data/coco_vehicle_benchmark/` are local-only and are not included in this repository. Provide model weights and labeled data separately, then configure `YOLO_MODEL_PATH`, `YOLO_MODEL_VARIANTS`, and `YOLO_DATASET_YAML` as needed. Detection and evaluation are unavailable until the required assets are configured. A COCO checkpoint detects the COCO vehicle classes car, motorcycle, bus, and truck. Custom weights are also supported when their class names include those vehicle types.

For comparison, set `YOLO_MODEL_VARIANTS` to a JSON object mapping model names to local weights files:

```dotenv
YOLO_MODEL_VARIANTS={"YOLOv8n":"/models/yolov8n.pt","YOLOv8s":"/models/yolov8s.pt"}
```

Only available/configured weights are evaluated; other model sizes remain **Not evaluated**. The comparison endpoint evaluates all configured variants on the same selected dataset split and device. Set `YOLO_MODEL_PATH`, `YOLO_MODEL_VARIANTS`, and `YOLO_DATASET_YAML` to point to assets available on the backend host. Keep model files on the backend host and do not put weight paths or camera URLs in frontend configuration.

### Camera-to-slot occupancy

Vehicle boxes do not by themselves identify a parking bay. To update slot occupancy, configure `YOLO_PARKING_ROIS` as JSON mapping existing `space_code` values to normalized `[x1, y1, x2, y2]` rectangle coordinates:

```dotenv
YOLO_PARKING_ROIS={"A-01":[0.05,0.20,0.24,0.65],"A-02":[0.26,0.20,0.45,0.65]}
```

Coordinates range from 0 to 1 relative to the camera frame. A detection center inside a configured ROI marks that space occupied; a later frame with no detection in that ROI marks it available. Reserved and held spaces are not overwritten. Calibrate regions for the fixed camera view before enabling automatic occupancy updates; the current ROI mapping applies to the camera view being processed.

To use server-side CCTV/RTSP streams, configure a trusted camera ID-to-source mapping on the backend:

```dotenv
YOLO_CAMERA_SOURCES={"north-gate":"rtsp://camera-host.example/stream"}
```

The browser only receives the camera IDs, not stream URLs. Configure sources only on a trusted network and protect credentials in the backend environment. Alternatively, **Browser camera** uses the browser's camera permission. Uploaded images and videos are supported; videos are sampled at up to 600 frames and the annotated video is served back by the API.

## Labeled evaluation dataset

When the local COCO benchmark is available, its detection subset has COCO-compatible class IDs and bounding-box labels, and its validation and test splits are defined in `data/coco_vehicle_benchmark/dataset/coco2017-subset.yaml`. The separate Matchbox dataset is for parking-space availability classification; it is not used to calculate YOLO detection metrics.

Prepare a standard Ultralytics detection dataset with matching images and YOLO-format labels (`class_id x_center y_center width height`, normalized to 0–1) in `images/{train,val,test}` and `labels/{train,val,test}`. For a detector trained with four classes, one possible class mapping is:

```yaml
path: /absolute/path/to/vehicle-dataset
train: images/train
val: images/val
test: images/test
names:
  0: car
  1: motorcycle
  2: bus
  3: truck
```

Use class IDs and names consistent with the checkpoint being evaluated. A COCO checkpoint must be evaluated using the COCO-compatible class IDs/names in its dataset configuration; do not relabel a four-class dataset as COCO classes. Then set:

```dotenv
YOLO_DATASET_YAML=/absolute/path/to/vehicle-dataset/data.yaml
```

Run **Evaluate YOLO Model** from **AI & Dataset**, choosing validation or test. mAP, precision, recall, F1, per-class AP, the confusion matrix, and the precision-recall curve come from Ultralytics' IoU-based object-detection evaluator. Object-detection accuracy is not reported as a classification accuracy proxy. Training and validation loss curves appear only when real Ultralytics training history is available in the checkpoint's run folder or through `YOLO_TRAINING_RESULTS`; validation does not invent or infer training losses.

## AI APIs

The frontend uses these APIs under `/api/ai/vehicle-detections`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/image` | Detect and persist vehicles in an uploaded image |
| `POST` | `/video` | Sample an uploaded video, persist detections, and create an annotated video |
| `GET` | `/videos/{filename}` | Retrieve a processed video |
| `GET` | `/cameras` | List configured CCTV IDs and browser-camera availability |
| `POST` | `/cameras/{camera_id}/frame` | Read and process the next frame from a configured CCTV source |
| `GET` | `/summary?days=1` | Parking totals, detection distribution, and actual history (1–30 days) |
| `GET` | `/history?limit=50` | Recent persisted vehicle detections |
| `GET` | `/evaluation` | Latest measured evaluation or unavailable status |
| `POST` | `/evaluate?split=test` | Evaluate configured models on the labeled dataset |
| `GET` | `/comparison` | Latest same-run model comparison, including unevaluated variants |

Detection rows, camera ID, class, confidence, parking slot when mapped, occupancy state, source, inference time, and timestamp are stored in `vehicle_detection_records`. Measured model results are stored in `yolo_model_evaluations`. These tables are added by the existing SQLAlchemy startup schema creation.

## Verification

Run the frontend checks:

```bash
npm run build
npm run lint
```

Check backend syntax:

```bash
python -m py_compile backend/app/main.py backend/app/models.py backend/app/ai_routes.py
```

The bundled COCO subset and weights allow an actual YOLO evaluation without additional dataset setup. Training-loss graphs remain explicitly unavailable for pretrained checkpoints without an associated training `results.csv`.

## Final-year presentation walkthrough

1. Start the API and frontend and open **AI & Dataset** to review measured model evaluations.
2. Demonstrate a browser camera, configured CCTV camera, or uploaded sample image/video. Show the original and annotated feed, class/confidence labels, elapsed inference, and saved detection history.
3. Explain that slot-level occupancy changes only after calibrating ROI rectangles; without ROIs, the dashboard preserves database occupancy.
4. Show occupied/available counts and charts, then explain that charts query persisted database records and refresh periodically.
5. Run a test comparison and show mAP, precision, recall, F1, class AP, the confusion matrix, precision-recall curve, inference time, FPS, and model size. Explain that parking classifiers are scored on occupancy labels, while YOLO is evaluated on labeled bounding boxes.
6. If training history is unavailable for the pretrained checkpoint, show the unavailable loss state rather than treating validation loss as training history.
