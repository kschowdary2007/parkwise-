import { useEffect, useRef, useState } from 'react'
import { Activity, Camera, Cpu, Database, Play, RefreshCw, Square, Upload } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  detectCameraFrame,
  detectImage,
  detectVideo,
  evaluateYoloModels,
  getConfiguredCameras,
  getDetectionHistory,
  getDetectionSummary,
  getYoloComparison,
  getYoloEvaluation,
} from '../api/ai'
import '../styles/ai-detection.css'

const CLASS_COLORS = ['#5b966d', '#db7657', '#719cb3', '#d2a44f']
const VEHICLE_CLASSES = ['car', 'motorcycle', 'bus', 'truck']
const metricLabels = [
  ['accuracy', 'Accuracy'],
  ['precision', 'Precision'],
  ['recall', 'Recall'],
  ['f1_score', 'F1-score'],
  ['map50', 'mAP@0.5'],
  ['map50_95', 'mAP@0.5:0.95'],
]

function percentage(value, digits = 1) {
  return value == null ? 'Evaluation data unavailable' : `${(Number(value) * 100).toFixed(digits)}%`
}

function ChartPanel({ eyebrow, title, source, children, className = '' }) {
  return (
    <article className={`panel yolo-chart-panel ${className}`}>
      <div className="data-panel-header">
        <div><span className="section-kicker">{eyebrow}</span><h2>{title}</h2></div>
        {source && <span className="chart-source-tag">{source}</span>}
      </div>
      {children}
    </article>
  )
}

function EmptyChart({ children = 'Evaluation data unavailable' }) {
  return <div className="yolo-empty-chart">{children}</div>
}

function AIDetectionPage() {
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [evaluation, setEvaluation] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [cameraIds, setCameraIds] = useState([])
  const [cameraId, setCameraId] = useState('browser')
  const [modelName, setModelName] = useState('')
  const [rangeDays, setRangeDays] = useState(1)
  const [split, setSplit] = useState('test')
  const [result, setResult] = useState(null)
  const [originalVideo, setOriginalVideo] = useState('')
  const [processedVideo, setProcessedVideo] = useState('')
  const [live, setLive] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  const refresh = async (days = rangeDays) => {
    const [summaryResponse, historyResponse, evaluationResponse, comparisonResponse, camerasResponse] = await Promise.all([
      getDetectionSummary(days),
      getDetectionHistory(),
      getYoloEvaluation(),
      getYoloComparison(),
      getConfiguredCameras(),
    ])
    setSummary(summaryResponse.data)
    setHistory(historyResponse.data)
    setEvaluation(evaluationResponse.data.result)
    setComparison(comparisonResponse.data)
    setCameraIds(camerasResponse.data.configured_camera_ids || [])
    setError('')
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        await refresh(rangeDays)
      } catch (requestError) {
        if (active) setError(requestError.message || 'Unable to load vehicle detection analytics.')
      }
    }
    load()
    const interval = window.setInterval(load, 10000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [rangeDays])

  useEffect(() => () => {
    if (originalVideo.startsWith('blob:')) URL.revokeObjectURL(originalVideo)
  }, [originalVideo])

  useEffect(() => {
    if (!live) return undefined
    let stream
    let interval
    let busy = false
    let active = true
    const videoElement = videoRef.current

    const sendFrame = async () => {
      if (busy) return
      busy = true
      try {
        let response
        if (cameraId === 'browser') {
          const video = videoRef.current
          const canvas = canvasRef.current
          if (!video || !canvas || video.readyState < 2) return
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d').drawImage(video, 0, 0)
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84))
          if (!blob) return
          response = await detectImage(new File([blob], 'camera-frame.jpg', { type: 'image/jpeg' }), 'browser-camera', modelName || undefined)
        } else {
          response = await detectCameraFrame(cameraId, modelName || undefined)
        }
        if (active) {
          setResult(response.data)
          setProcessedVideo('')
          setNotice('')
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message || 'Live camera detection failed.')
          setLive(false)
        }
      } finally {
        busy = false
      }
    }

    const start = async () => {
      if (cameraId === 'browser') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          if (!active) {
            stream.getTracks().forEach((track) => track.stop())
            return
          }
          videoElement.srcObject = stream
          await videoElement.play()
        } catch (requestError) {
          setError(requestError.message || 'Camera permission was denied or no camera is available.')
          setLive(false)
          return
        }
      }
      await sendFrame()
      interval = window.setInterval(sendFrame, cameraId === 'browser' ? 1800 : 2200)
    }
    start()
    return () => {
      active = false
      window.clearInterval(interval)
      stream?.getTracks().forEach((track) => track.stop())
      if (videoElement?.srcObject === stream) videoElement.srcObject = null
    }
  }, [live, cameraId, modelName])

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLive(false)
    setError('')
    setNotice('')
    setResult(null)
    setProcessedVideo('')
    setUploading(true)
    if (file.type.startsWith('video/')) {
      setOriginalVideo(URL.createObjectURL(file))
      try {
        const response = await detectVideo(file, 'upload', modelName || undefined)
        const baseUrl = new URL(import.meta.env.VITE_API_URL || '/api', window.location.origin)
        setProcessedVideo(new URL(response.data.video_url, baseUrl).toString())
        setResult(response.data)
        setNotice(`Processed ${response.data.processed_frames} sampled video frames.`)
      } catch (requestError) {
        setError(requestError.message || 'Unable to process this video.')
      }
    } else {
      setOriginalVideo('')
      try {
        const response = await detectImage(file, 'upload', modelName || undefined)
        setResult(response.data)
        setNotice(`${response.data.detection_count} vehicle(s) detected in the image.`)
      } catch (requestError) {
        setError(requestError.message || 'Unable to process this image.')
      }
    }
    setUploading(false)
    refresh().catch((requestError) => setError(requestError.message))
  }

  const runEvaluation = async () => {
    setEvaluating(true)
    setError('')
    setNotice('')
    try {
      const response = await evaluateYoloModels(split)
      setNotice(`Compared ${response.data.comparison.length} configured model(s) on the ${split} split.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Unable to evaluate configured YOLO models.')
    } finally {
      setEvaluating(false)
    }
  }

  const metrics = evaluation?.metrics || null
  const evaluatedModels = (comparison?.comparison || []).filter((model) => model.metrics)
  const metricBars = metricLabels.map(([key, label]) => ({
    metric: label,
    value: metrics?.[key] == null ? null : Number(metrics[key]) * 100,
  }))
  const modelBars = evaluatedModels.map((model) => ({
    model: model.model_name,
    'mAP@0.5': model.metrics.map50 == null ? null : Number(model.metrics.map50) * 100,
    'mAP@0.5:0.95': model.metrics.map50_95 == null ? null : Number(model.metrics.map50_95) * 100,
  }))
  const yoloModelChartData = modelBars.length
    ? modelBars
    : comparison?.comparison?.length
      ? comparison.comparison.map((model) => ({ model: model.model_name }))
      : ['YOLOv8n', 'YOLOv8s', 'YOLOv8m', 'YOLOv8l'].map((model) => ({ model }))
  const yoloMetricComparison = evaluatedModels.length
    ? evaluatedModels.map((model) => ({
      model: model.model_name,
      Precision: model.metrics.precision == null ? null : model.metrics.precision * 100,
      Recall: model.metrics.recall == null ? null : model.metrics.recall * 100,
      'F1-score': model.metrics.f1_score == null ? null : model.metrics.f1_score * 100,
    }))
    : yoloModelChartData
  const modelPerformanceBars = evaluatedModels.length
    ? evaluatedModels.map((model) => ({
      model: model.model_name,
      FPS: model.metrics.fps,
      'Inference ms': model.metrics.inference_ms,
    }))
    : yoloModelChartData
  const occupancy = summary?.occupancy
  const distribution = VEHICLE_CLASSES.map((vehicleClass, index) => ({
    name: vehicleClass === 'motorcycle' ? 'Bike' : vehicleClass[0].toUpperCase() + vehicleClass.slice(1),
    value: summary?.vehicle_distribution?.[vehicleClass] || 0,
    color: CLASS_COLORS[index],
  }))
  const capacityPie = [
    { name: 'Occupied', value: occupancy?.occupied_spaces || 0, color: '#db7657' },
    { name: 'Available', value: occupancy?.available_spaces || 0, color: '#719cb3' },
    { name: 'Reserved', value: occupancy?.reserved_spaces || 0, color: '#d2a44f' },
    { name: 'Held', value: occupancy?.held_spaces || 0, color: '#a5b09f' },
  ]
  const historyPoints = [...new Map(history.map((item) => [item.timestamp, item])).values()]
    .reverse()
    .map((item) => ({
      time: new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      inference_ms: item.inference_ms,
      fps: item.inference_ms > 0 ? 1000 / item.inference_ms : null,
    }))
  const confusion = evaluation?.confusion_matrix

  return (
    <section className="data-page yolo-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow"><span className="eyebrow-square"><Cpu size={12} /></span> COMPUTER VISION <span className="eyebrow-divider">/</span> YOLO DETECTION</p>
          <h1>Vehicle intelligence<span className="heading-mark">.</span></h1>
          <p className="intro-subtitle">Live detection, measured model performance, and parking utilization from saved application data.</p>
        </div>
        <div className="yolo-page-actions">
          <label className="yolo-range-select">History
            <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
              <option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option>
            </select>
          </label>
          <button className="reserve-button" onClick={() => refresh().catch((requestError) => setError(requestError.message))}><RefreshCw size={14} /> Refresh</button>
        </div>
      </header>
      {error && <div className="yolo-alert" role="alert">{error}</div>}
      {notice && <div className="yolo-notice" role="status">{notice}</div>}

      <div className="yolo-kpis">
        <article className="panel"><span className="yolo-kpi-icon green"><Database size={16} /></span><small>TOTAL SPACES</small><strong>{occupancy?.total_spaces ?? '—'}</strong><span>From the parking database</span></article>
        <article className="panel"><span className="yolo-kpi-icon orange"><Activity size={16} /></span><small>OCCUPIED</small><strong>{occupancy?.occupied_spaces ?? '—'}</strong><span>{occupancy?.occupancy_percent == null ? '—' : `${occupancy.occupancy_percent}%`} of configured spaces</span></article>
        <article className="panel"><span className="yolo-kpi-icon blue"><Camera size={16} /></span><small>AVAILABLE</small><strong>{occupancy?.available_spaces ?? '—'}</strong><span>Live space status</span></article>
        <article className="panel"><span className="yolo-kpi-icon gold"><Cpu size={16} /></span><small>VEHICLE DETECTIONS</small><strong>{summary?.detected_vehicles_total ?? '—'}</strong><span>{summary?.detected_vehicles_period ?? 0} in selected period</span></article>
      </div>

      <section className="panel yolo-feed-panel">
        <div className="data-panel-header">
          <div><span className="section-kicker">DETECTION INPUT</span><h2>Live camera and media</h2></div>
          <div className="yolo-feed-actions">
            <label className="yolo-camera-picker">Camera
              <select value={cameraId} onChange={(event) => setCameraId(event.target.value)} disabled={live}>
                <option value="browser">Browser camera</option>
                {cameraIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
            <label className="yolo-camera-picker">Model
              <select value={modelName} onChange={(event) => setModelName(event.target.value)} disabled={live || uploading}>
                <option value="">Default configured</option>
                {(comparison?.configured_models || []).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <button type="button" className={`yolo-live-button ${live ? 'is-live' : ''}`} onClick={() => { setError(''); if (!live) { setOriginalVideo(''); setProcessedVideo(''); setResult(null) } setLive((active) => !active) }} disabled={uploading}>
              {live ? <Square size={13} /> : <Play size={13} />}{live ? 'Stop live' : 'Start live'}
            </button>
            <button type="button" className="reserve-button" onClick={() => fileInput.current?.click()} disabled={uploading || live}>
              <Upload size={14} /> {uploading ? 'Processing…' : 'Upload image / video'}
            </button>
            <input ref={fileInput} className="yolo-file-input" type="file" accept="image/*,video/*" onChange={handleUpload} />
          </div>
        </div>
        <p className="yolo-feed-help">Use a browser camera, a server-configured CCTV stream, or upload an image/video. Video inference samples at most 600 frames.</p>
        {!occupancy?.roi_configured && <p className="yolo-roi-warning">Parking occupancy remains based on saved space statuses until camera-to-slot regions are configured. Vehicle detections are still recorded.</p>}
        <div className="yolo-feeds">
          <div className="yolo-feed">
            <div className="yolo-feed-label"><span>Original feed</span>{live && <i>LIVE</i>}</div>
            {originalVideo
              ? <video key={originalVideo} src={originalVideo} controls playsInline />
              : <video ref={videoRef} className={live && cameraId === 'browser' ? '' : 'yolo-hidden-video'} muted playsInline />}
            {!originalVideo && !(live && cameraId === 'browser') && result?.original_image && <img src={result.original_image} alt="Original camera or uploaded image" />}
            {!originalVideo && !(live && cameraId === 'browser') && !result?.original_image && <div className="yolo-feed-placeholder"><Camera size={24} /><span>Start a camera or upload media</span></div>}
            <canvas ref={canvasRef} className="yolo-capture-canvas" />
          </div>
          <div className="yolo-feed">
            <div className="yolo-feed-label"><span>Processed detection feed</span>{result && <i>{result.detection_count} detections</i>}</div>
            {processedVideo
              ? <video key={processedVideo} src={processedVideo} controls playsInline />
              : result?.processed_image
                ? <img src={result.processed_image} alt="Processed feed with vehicle bounding boxes" />
                : <div className="yolo-feed-placeholder"><Activity size={24} /><span>Bounding-box output appears here</span></div>}
          </div>
        </div>
        <div className="yolo-live-metrics">
          <div><small>{result?.processed_frames ? 'DETECTIONS IN VIDEO SAMPLES' : 'VEHICLES IN LAST FRAME'}</small><strong>{result?.detection_count ?? '—'}</strong></div>
          <div><small>LIVE CONFIDENCE</small><strong>{result?.confidence_mean == null ? '—' : `${(result.confidence_mean * 100).toFixed(1)}%`}</strong></div>
          <div><small>INFERENCE TIME</small><strong>{result?.inference_ms == null ? '—' : `${result.inference_ms} ms`}</strong></div>
          <div><small>LIVE FPS</small><strong>{result?.fps == null ? '—' : result.fps}</strong></div>
        </div>
        {result?.detections?.length > 0 && <div className="yolo-detection-chips">
          {result.detections.slice(0, 12).map((detection, index) => <span key={`${detection.vehicle_class}-${index}`}>
            {detection.vehicle_class} · {(detection.confidence * 100).toFixed(1)}% · [{detection.bbox.map((value) => Math.round(value)).join(', ')}]
          </span>)}
        </div>}
      </section>

      <section className="yolo-chart-grid">
        <ChartPanel eyebrow="VALIDATION / TEST" title="Detection metrics" source={evaluation?.split || 'Not evaluated'}>
          {metrics ? <>
            <div className="yolo-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={metricBars} margin={{ top: 10, right: 12, left: -12, bottom: 4 }}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="metric" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip formatter={(value) => value == null ? ['Not applicable', 'Metric'] : [`${Number(value).toFixed(2)}%`, 'Score']} /><Bar dataKey="value" name="Score" fill="#638461" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <div className="yolo-metric-values">{metricLabels.map(([key, label]) => <div key={key}><small>{label}</small><strong>{key === 'accuracy' && metrics[key] == null ? 'N/A for object detection' : percentage(metrics[key], 2)}</strong></div>)}</div>
          </> : <EmptyChart />}
          <p className="yolo-chart-note">Accuracy is not treated as a detection metric; precision, recall and mAP come from IoU-based Ultralytics validation.</p>
        </ChartPanel>
        <ChartPanel eyebrow="MODEL EVALUATION" title="mAP comparison" source={comparison?.dataset_name || 'Labeled dataset required'}>
          <div className={`yolo-chart ${!modelBars.length ? 'yolo-chart-placeholder' : ''}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={yoloModelChartData} margin={{ top: 10, right: 12, left: -12, bottom: 4 }}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="model" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip formatter={(value) => value == null ? ['Not evaluated'] : [`${Number(value).toFixed(2)}%`, '']} /><Legend /><Bar dataKey="mAP@0.5" fill="#719cb3" radius={[3, 3, 0, 0]} /><Bar dataKey="mAP@0.5:0.95" fill="#5b966d" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>{!modelBars.length && <div className="yolo-chart-overlay">mAP results require YOLO evaluation on labeled detection data</div>}</div>
          <div className="yolo-evaluation-controls"><label>Split <select value={split} onChange={(event) => setSplit(event.target.value)}><option value="test">Test</option><option value="validation">Validation</option></select></label><button className="reserve-button" onClick={runEvaluation} disabled={evaluating}>{evaluating ? 'Evaluating…' : 'Evaluate configured models'}</button></div>
        </ChartPanel>
        <ChartPanel eyebrow="YOLO MODEL COMPARISON" title="Precision, recall and F1 by model" source={comparison?.split || 'Evaluation required'}>
          <div className={`yolo-chart ${!evaluatedModels.length ? 'yolo-chart-placeholder' : ''}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={yoloMetricComparison} margin={{ top: 10, right: 12, left: -12, bottom: 4 }}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="model" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip formatter={(value) => value == null ? ['Not evaluated'] : [`${Number(value).toFixed(2)}%`]} /><Legend /><Bar dataKey="Precision" fill="#638461" /><Bar dataKey="Recall" fill="#d4876c" /><Bar dataKey="F1-score" fill="#8da4b0" /></BarChart></ResponsiveContainer>{!evaluatedModels.length && <div className="yolo-chart-overlay">Per-model scores appear after evaluating configured YOLO weights</div>}</div>
        </ChartPanel>
        <ChartPanel eyebrow="FACILITY STATUS" title="Parking occupancy" source="Live database">
          {occupancy && occupancy.total_spaces > 0
            ?             <div className="yolo-pie-layout"><div className="yolo-pie"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={capacityPie} dataKey="value" nameKey="name" innerRadius="57%" outerRadius="82%" paddingAngle={3} stroke="none">{capacityPie.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="yolo-pie-legend">{capacityPie.map((item) => <div key={item.name}><i style={{ backgroundColor: item.color }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}<b>{occupancy.occupancy_percent ?? '—'}% occupied</b></div></div>
            : <EmptyChart>Parking space data unavailable</EmptyChart>}
        </ChartPanel>
        <ChartPanel eyebrow="VEHICLE DETECTIONS" title="Class distribution" source={`${rangeDays} day(s)`}>
          {summary && summary.detected_vehicles_period > 0
            ? <div className="yolo-pie-layout"><div className="yolo-pie"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius="57%" outerRadius="82%" paddingAngle={3} stroke="none">{distribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="yolo-pie-legend">{distribution.map((item) => <div key={item.name}><i style={{ backgroundColor: item.color }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}</div></div>
            : <EmptyChart>No vehicle detections recorded for this period</EmptyChart>}
        </ChartPanel>
        <ChartPanel eyebrow="PARKING UTILIZATION" title="Occupancy over time" source={`${rangeDays} day(s)`}>
          {summary?.occupancy_timeline?.length ? <div className="yolo-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={summary.occupancy_timeline.map((point) => ({ ...point, time: new Date(point.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }))}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="time" minTickGap={30} tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip formatter={(value) => [`${value}%`, 'Occupied']} /><Line type="monotone" dataKey="occupancy_percent" stroke="#638461" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div> : <EmptyChart>No occupancy history recorded for this period</EmptyChart>}
        </ChartPanel>
        <ChartPanel eyebrow="CAMERA PERFORMANCE" title="Inference time and FPS" source="Measured detections">
          {historyPoints.length ? <div className="yolo-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={historyPoints}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="time" minTickGap={30} tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip /><Legend /><Bar yAxisId="left" dataKey="inference_ms" name="Inference ms" fill="#d2a44f" radius={[3, 3, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="fps" name="FPS" stroke="#719cb3" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div> : <EmptyChart>No inference measurements recorded</EmptyChart>}
        </ChartPanel>
        <ChartPanel eyebrow="YOLO MODEL COMPARISON" title="Inference speed by model" source={comparison?.split || 'Evaluation required'}>
          <div className={`yolo-chart ${!evaluatedModels.length ? 'yolo-chart-placeholder' : ''}`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={modelPerformanceBars}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="model" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip formatter={(value) => value == null ? ['Not evaluated'] : [Number(value).toFixed(2)]} /><Legend /><Bar yAxisId="left" dataKey="FPS" fill="#719cb3" /><Line yAxisId="right" type="monotone" dataKey="Inference ms" stroke="#db7657" strokeWidth={2} /></ComposedChart></ResponsiveContainer>{!evaluatedModels.length && <div className="yolo-chart-overlay">FPS and inference time appear after measuring configured model weights</div>}</div>
        </ChartPanel>
        <ChartPanel eyebrow="VEHICLE ACTIVITY" title="Detection count over time" source={`${rangeDays} day(s)`}>
          {summary?.detection_timeline?.length
            ? <div className="yolo-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={summary.detection_timeline.map((point) => ({ ...point, time: new Date(point.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }))}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="time" minTickGap={30} tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip /><Line type="monotone" dataKey="detections" name="Vehicle detections" stroke="#d4876c" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>
            : <EmptyChart>No vehicle detections recorded for this period</EmptyChart>}
        </ChartPanel>
        <ChartPanel eyebrow="TRAINING HISTORY" title="Training and validation loss" source="Optional">
          <EmptyChart>Training history unavailable for the configured pretrained model.</EmptyChart>
        </ChartPanel>
      </section>

      {confusion?.values && <ChartPanel eyebrow="TEST / VALIDATION" title="Confusion matrix heatmap" source={evaluation?.split}>
        <div className="yolo-confusion"><table>
          <thead><tr><th>Actual / Predicted</th>{confusion.values.map((_, index) => <th key={index}>{confusion.labels?.[index] || index}</th>)}</tr></thead>
          <tbody>{confusion.values.map((row, rowIndex) => <tr key={rowIndex}><th>{confusion.labels?.[rowIndex] || rowIndex}</th>{row.map((value, columnIndex) => {
            const maximum = Math.max(...confusion.values.flat(), 1)
            return <td key={columnIndex} title={`${confusion.labels?.[rowIndex] || rowIndex} / ${confusion.labels?.[columnIndex] || columnIndex}: ${value}`} style={{ backgroundColor: `rgba(91, 150, 109, ${0.08 + 0.72 * value / maximum})` }}>{Number(value).toFixed(0)}</td>
          })}</tr>)}</tbody>
        </table></div>
      </ChartPanel>}
    </section>
  )
}

export default AIDetectionPage
