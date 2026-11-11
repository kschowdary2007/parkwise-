import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BarChart3,
  Blocks,
  Building2,
  Camera,
  CarFront,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Cpu,
  Database,
  Eye,
  LocateFixed,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Pencil,
  Plus,
  ScanLine,
  Search,
  Save,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  UserRound,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Legend,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import { getDashboardSummary, getAnalyticsDemand, getAnalyticsOccupancy, getAnalyticsRevenue } from './api/dashboard'
import { getParkingSpaces, getParkingRecommendation, updateParkingSpace } from './api/parking'
import { createVehicle, getVehicles, updateVehicle } from './api/vehicles'
import { cancelReservation, createReservation, getReservations } from './api/reservations'
import { getPayments } from './api/payments'
import api from './api/client'
import AIDetectionPage from './pages/AIDetectionPage'
import { evaluateYoloModels, getDetectionHistory, getDetectionSummary, getYoloComparison } from './api/ai'

const fallbackSpaces = [
  { id: 1, space_code: 'A-01', floor: 'Level 01', zone: 'A', status: 'AVAILABLE', accessibility: true, ev: false },
  { id: 2, space_code: 'A-02', floor: 'Level 01', zone: 'A', status: 'OCCUPIED', accessibility: false, ev: false },
  { id: 3, space_code: 'A-03', floor: 'Level 01', zone: 'A', status: 'AVAILABLE', accessibility: false, ev: true },
  { id: 4, space_code: 'A-04', floor: 'Level 01', zone: 'A', status: 'RESERVED', accessibility: false, ev: false },
  { id: 5, space_code: 'B-01', floor: 'Level 01', zone: 'B', status: 'AVAILABLE', accessibility: true, ev: false },
  { id: 6, space_code: 'B-02', floor: 'Level 01', zone: 'B', status: 'HELD', accessibility: false, ev: false },
  { id: 7, space_code: 'B-03', floor: 'Level 01', zone: 'B', status: 'OCCUPIED', accessibility: false, ev: false },
  { id: 8, space_code: 'B-04', floor: 'Level 01', zone: 'B', status: 'AVAILABLE', accessibility: false, ev: true },
  { id: 9, space_code: 'C-01', floor: 'Level 01', zone: 'C', status: 'AVAILABLE', accessibility: true, ev: false },
  { id: 10, space_code: 'C-02', floor: 'Level 01', zone: 'C', status: 'OCCUPIED', accessibility: false, ev: false },
  { id: 11, space_code: 'C-03', floor: 'Level 01', zone: 'C', status: 'AVAILABLE', accessibility: false, ev: false },
  { id: 12, space_code: 'C-04', floor: 'Level 01', zone: 'C', status: 'RESERVED', accessibility: false, ev: false },
  { id: 13, space_code: 'D-01', floor: 'Level 01', zone: 'D', status: 'OCCUPIED', accessibility: false, ev: false },
  { id: 14, space_code: 'D-02', floor: 'Level 01', zone: 'D', status: 'AVAILABLE', accessibility: false, ev: false },
  { id: 15, space_code: 'D-03', floor: 'Level 01', zone: 'D', status: 'AVAILABLE', accessibility: false, ev: false },
  { id: 16, space_code: 'D-04', floor: 'Level 01', zone: 'D', status: 'HELD', accessibility: false, ev: false },
  { id: 17, space_code: 'E-01', floor: 'Level 01', zone: 'E', status: 'AVAILABLE', accessibility: true, ev: false },
  { id: 18, space_code: 'E-02', floor: 'Level 01', zone: 'E', status: 'AVAILABLE', accessibility: false, ev: false },
  { id: 19, space_code: 'E-03', floor: 'Level 01', zone: 'E', status: 'AVAILABLE', accessibility: false, ev: true },
  { id: 20, space_code: 'E-04', floor: 'Level 01', zone: 'E', status: 'OCCUPIED', accessibility: false, ev: false },
]

const stages = [
  [Camera, 'Capture', 'Camera / IoT feed', 'Connected'],
  [ScanLine, 'Detect', 'YOLOv8 · CNN', 'Processing'],
  [Database, 'Update', 'Parking status DB', 'Synced'],
  [BarChart3, 'Predict', 'Demand forecast', 'Ready'],
  [Navigation, 'Navigate', 'A* pathfinding', 'Active'],
]
const navItems = [
  { label: 'Overview', path: '/dashboard', icon: Blocks },
  { label: 'Space Finder', path: '/space-finder', icon: MapPin },
  { label: 'Demand Forecast', path: '/demand-forecast', icon: BarChart3 },
  { label: 'AI & Dataset', path: '/ai-dataset', icon: Eye },
  { label: 'Vehicle Detection', path: '/ai-detection', icon: ScanLine },
  { label: 'Parking Spaces', path: '/parking-spaces', icon: LocateFixed },
  { label: 'Vehicles', path: '/vehicles', icon: CarFront },
  { label: 'Reservations', path: '/reservations', icon: ShieldCheck },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Shield },
]

function getTimeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function ModelComparisonBar({ x = 0, y = 0, width = 0, height = 0, fill, payload }) {
  const isYolo = Boolean(payload?.isYolo)
  const isBestYolo = Boolean(payload?.isBestYolo)
  const barWidth = width * (isYolo ? 1.45 : 0.72)

  return (
    <rect
      x={x + (width - barWidth) / 2}
      y={y}
      width={barWidth}
      height={height}
      fill={fill}
      fillOpacity={isYolo ? 1 : 0.65}
      stroke={isBestYolo ? '#263f31' : 'none'}
      strokeWidth={isBestYolo ? 2 : 0}
      rx={2}
    />
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoute />} />
      </Routes>
    </BrowserRouter>
  )
}

function ProtectedRoute() {
  const token = localStorage.getItem('parkwise-token')
  if (!token) return <Navigate to="/login" replace />
  return <Shell />
}

function Shell() {
  const [mobileNav, setMobileNav] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [propertyMenuOpen, setPropertyMenuOpen] = useState(false)
  const [properties, setProperties] = useState([])
  const [selectedPropertyId, setSelectedPropertyId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('parkwise-display-name') || 'krishna')
  const location = useLocation()
  const navigate = useNavigate()
  const currentProperty = properties.find((property) => property.id === selectedPropertyId) || properties[0]
  const currentPage = navItems.find((item) => item.path === location.pathname)?.label || 'Overview'

  const showNotice = useCallback((message) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200)
  }, [])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    api.get('/parking/lots')
      .then((response) => {
        setProperties(response.data)
        setSelectedPropertyId(response.data[0]?.id ?? null)
      })
      .catch((error) => {
        setProperties([])
        setSelectedPropertyId(null)
        showNotice(error.message || 'Unable to load parking facilities.')
      })
  }, [showNotice])
  const syncWorkspace = async () => {
    setSyncing(true)
    setRefreshKey((key) => key + 1)
    try {
      const response = await api.get('/health')
      showNotice(response.data.database === 'connected' ? 'Workspace data refreshed.' : 'API is online, but the database is disconnected.')
    } catch (error) {
      showNotice(error.message || 'Unable to reach the Parkwise API.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <div className="brand">
          <span className="brand-symbol"><span /></span>
          <span className="brand-name">park<span>wise</span></span>
          <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>
        <button className="property-picker" aria-expanded={propertyMenuOpen} onClick={() => setPropertyMenuOpen((open) => !open)}>
          <span className="property-initial">{(currentProperty?.name || 'N').slice(0, 1)}</span>
          <span className="property-name"><strong>{currentProperty?.name || 'Loading facility...'}</strong><small>Car park · {currentProperty?.levels?.[0] || 'Level 01'}</small></span>
          <ChevronRight size={15} />
        </button>
        {propertyMenuOpen && <div className="property-popover">
          <span className="property-popover-label">PARKING FACILITY</span>
          {properties.map((property) => <button key={property.id} className={property.id === currentProperty?.id ? 'is-current' : ''} onClick={() => { setSelectedPropertyId(property.id); setPropertyMenuOpen(false) }}>
            <span className="property-initial">{property.name.slice(0, 1)}</span>
            <span><strong>{property.name}</strong><small>{property.location} · {property.capacity} spaces</small><small>{property.levels.join(', ') || 'No levels reported'}</small></span>
            {property.id === currentProperty?.id && <Check size={14} />}
          </button>)}
          <button className="property-view-spaces" onClick={() => { setPropertyMenuOpen(false); navigate('/parking-spaces') }}>View facility spaces <ArrowRight size={13} /></button>
        </div>}
        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-caption">Operations</span>
          {navItems.slice(0, 7).map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`} onClick={() => setMobileNav(false)}>
              <Icon size={17} />
              <span>{label}</span>
              {path === '/dashboard' && <span className="nav-live"><i /> LIVE</span>}
            </NavLink>
          ))}
          <span className="nav-caption nav-caption-spaced">Systems</span>
          {navItems.slice(7).map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`} onClick={() => setMobileNav(false)}>
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-health">
            <span className="health-icon"><ShieldCheck size={16} /></span>
            <span><strong>All systems normal</strong><small>Last checked 12 sec ago</small></span>
            <span className="health-dot" />
          </div>
          <div className="account-wrap">
            <button className="account account-trigger" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>
              <span className="account-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
              <span><strong>{displayName}</strong><small>Parking administrator</small></span>
              <span className="account-menu">···</span>
            </button>
            {accountMenuOpen && <div className="account-popover">
              <div className="account-popover-profile"><span className="account-avatar">{displayName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>admin@parkwise.local</small></span></div>
              <button onClick={() => { setAccountMenuOpen(false); navigate('/settings') }}><Settings2 size={15} /> Profile & settings</button>
              <button className="account-signout" onClick={() => { localStorage.removeItem('parkwise-token'); navigate('/login') }}><LogOut size={15} /> Sign out</button>
            </div>}
          </div>
        </div>
      </aside>
      {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <main className="main-content" id="top">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumbs">
            <span>{currentProperty?.name || 'Parking facility'}</span>
            <span className="crumb-slash">/</span>
            <strong>{currentPage}</strong>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={15} />
              <input placeholder="Find a parking space" aria-label="Find a parking space" />
            </label>
            <button className="scan-button" onClick={syncWorkspace} disabled={syncing}>
              <Activity className={syncing ? 'syncing-icon' : ''} size={15} /> {syncing ? 'Syncing' : 'Live sync'}
            </button>
          </div>
        </header>
        <div className="page-wrap">
          <Routes key={refreshKey}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage showNotice={showNotice} />} />
            <Route path="/project-overview" element={<ProjectOverviewPage />} />
            <Route path="/space-finder" element={<SpaceFinderPage showNotice={showNotice} />} />
            <Route path="/demand-forecast" element={<DemandForecastPage />} />
            <Route path="/live-pipeline" element={<LivePipelinePage />} />
            <Route path="/ai-dataset" element={<AIDatasetPage />} />
            <Route path="/ai-detection" element={<AIDetectionPage />} />
            <Route path="/testing-evaluation" element={<TestingEvaluationPage />} />
            <Route path="/parking-spaces" element={<ParkingSpacesPage showNotice={showNotice} />} />
            <Route path="/vehicles" element={<VehiclesPage showNotice={showNotice} />} />
            <Route path="/reservations" element={<ReservationsPage showNotice={showNotice} />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage onNameChange={setDisplayName} showNotice={showNotice} />} />
          </Routes>
        </div>
      </main>
      {notice && <div className="toast-message" role="status"><span><Check size={15} /></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  )
}

function DashboardPage({ showNotice = () => {} }) {
  const [greeting, setGreeting] = useState(getTimeGreeting)
  const [summary, setSummary] = useState({ total_spaces: null, available_spaces: null, occupied_spaces: null, reserved_spaces: null, held_spaces: null, occupancy_rate: null, predicted_peak: null, detection_accuracy: null, active_cameras: null, vehicles_today: null, revenue_today: null })
  const [spaces, setSpaces] = useState(fallbackSpaces)
  const [forecastData, setForecastData] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState('A-01')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [routeError, setRouteError] = useState('')
  const [routeData, setRouteData] = useState({ path: ['ENTRANCE', 'A1', 'A2', 'A-01'], distance: 48, estimated_time: 3 })

  useEffect(() => {
    const interval = window.setInterval(() => setGreeting(getTimeGreeting()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let active = true
    let initialized = false
    const loadDashboard = () => Promise.all([getDashboardSummary(), getParkingSpaces(), getAnalyticsDemand()])
      .then(([summaryRes, spacesRes, forecastRes]) => {
        if (!active) return
        setSummary(summaryRes.data)
        setSpaces(spacesRes.data || fallbackSpaces)
        setForecastData(forecastRes.data || [])
        if (!initialized && spacesRes.data?.[0]?.space_code) setSelectedId(spacesRes.data[0].space_code)
        initialized = true
        setLoading(false)
        setError('')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'Unable to connect to the Parkwise backend.')
        setLoading(false)
      })
    loadDashboard()
    const interval = window.setInterval(loadDashboard, 10000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const selected = useMemo(() => spaces.find((space) => space.space_code === selectedId) || spaces[0], [spaces, selectedId])
  const visible = useMemo(() => spaces.filter((space) => {
    const matchesFilter = filter === 'all' || (filter === 'accessible' ? space.accessibility : space.status.toLowerCase() === filter)
    const matchesSearch = space.space_code.toLowerCase().includes(search.trim().toLowerCase())
    return matchesFilter && matchesSearch
  }), [spaces, filter, search])

  const available = spaces.filter((space) => space.status === 'AVAILABLE').length
  const occupied = spaces.filter((space) => space.status === 'OCCUPIED').length
  const peakForecast = forecastData.reduce((peak, point) => point.occupancy_percent > (peak?.occupancy_percent ?? -1) ? point : peak, null)
  const peakTime = String(summary.predicted_peak || peakForecast?.hour || '--:--').split(':')
  useEffect(() => {
    if (!selected?.space_code) return
    api.post('/navigation/route', { start: 'ENTRANCE', destination: selected.space_code })
      .then((response) => {
        setRouteData(response.data)
        setRouteError('')
      })
      .catch((requestError) => {
        setRouteData({ path: [], distance: null, estimated_time: null })
        setRouteError(requestError.message || 'Unable to load route directions.')
      })
  }, [selected?.space_code])

  const reserveSpace = async () => {
    if (!selected || selected.status !== 'AVAILABLE') return showNotice('This space is not available to reserve.')
    try {
      await api.post('/reservations', { vehicle_id: 1, parking_space_id: selected.id })
      setSpaces((current) => current.map((space) => (space.id === selected.id ? { ...space, status: 'RESERVED' } : space)))
      showNotice(`${selected.space_code} reserved for your arrival.`)
    } catch (err) {
      showNotice(err.message || 'Reservation failed.')
    }
  }

  const runScan = () => showNotice('Camera scanning is demo-only; occupancy was not changed.')

  if (loading) return <LoadingCard message="Loading parking spaces..." />
  if (error) return <ErrorCard message={error} />

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow"><span className="eyebrow-square"><Blocks size={12} /></span> SMART PARKING <span className="eyebrow-divider">/</span> COMMAND CENTRE</p>
          <h1>{greeting}<span className="heading-mark">.</span></h1>
          <p className="intro-subtitle">Live occupancy and availability at Northgate Centre.</p>
        </div>
        <button className="scan-button" onClick={runScan}><ScanLine size={15} /> Camera scan preview</button>
      </section>

      <section className="overview-metrics" aria-label="Parking lot status">
        <MetricCard icon={<CircleDot size={16} />} label="SPACES AVAILABLE" value={String(summary.available_spaces ?? available).padStart(2, '0')} total={`/ ${summary.total_spaces ?? spaces.length}`} note="Updated just now" tone="available" width={((summary.available_spaces ?? available) / (summary.total_spaces || spaces.length)) * 100} />
        <MetricCard icon={<CarFront size={17} />} label="CURRENTLY OCCUPIED" value={String(summary.occupied_spaces ?? occupied).padStart(2, '0')} total={`/ ${summary.total_spaces ?? spaces.length} spaces`} note="Live camera detection" tone="occupied" width={((summary.occupied_spaces ?? occupied) / (summary.total_spaces || spaces.length)) * 100} />
        <MetricCard icon={<Activity size={16} />} label="PREDICTED PEAK" value={peakTime[0]} unit={peakTime[1] ? `:${peakTime[1]}` : ''} total="TODAY" note={peakForecast ? `${peakForecast.occupancy_percent}% forecast occupancy` : 'Forecast unavailable'} tone="prediction" width={peakForecast?.occupancy_percent ?? 0} custom={<div className="peak-sparkline">{forecastData.map((point) => <i key={point.hour} style={{ height: `${point.occupancy_percent}%` }} />)}</div>} />
        <MetricCard icon={<ScanLine size={16} />} label="VEHICLES DETECTED" value={String(summary.vehicles_detected ?? 0).padStart(2, '0')} total="" note="Saved YOLO detections" tone="detection" width={null} />
      </section>

      <section className="primary-grid" id="parking">
        <article className="panel parking-panel">
          <div className="panel-heading parking-heading">
            <div>
              <span className="section-kicker"><span className="live-indicator" /> CURRENT OCCUPANCY</span>
              <h2>Find a parking space</h2>
              <p className="panel-description">Select a bay to review availability and route details.</p>
            </div>
            <button className="icon-button map-locate" onClick={() => showNotice(`Showing the route to ${selected?.space_code}.`)} aria-label="Show selected route"><LocateFixed size={17} /></button>
          </div>
          <div className="map-toolbar">
            <div className="filter-tabs" role="group" aria-label="Filter parking spaces">
              {[['all', 'All spaces'], ['available', 'Available'], ['occupied', 'Occupied'], ['accessible', 'Accessible']].map(([value, label]) => (
                <button key={value} className={filter === value ? 'filter-active' : ''} onClick={() => setFilter(value)}>
                  {label}
                  {value === 'available' && <span className="filter-count">{available}</span>}
                </button>
              ))}
            </div>
            <span className="camera-indicator"><Camera size={13} /> CAM 01 <span>ONLINE</span></span>
          </div>
          <div className="map-frame">
            <span className="map-orientation">N <ArrowUpRight size={11} /></span>
            <div className="map-camera-tag"><Camera size={12} /><span>CAM 01</span><i /></div>
            <div className="parking-bank parking-bank-top">
              {visible.filter((space) => space.zone === 'A' || space.zone === 'B').map((space) => (
                <ParkingSpace key={space.id} space={space} selected={space.space_code === selected?.space_code} onSelect={() => setSelectedId(space.space_code)} />
              ))}
            </div>
            <div className="drive-aisle"><span className="aisle-dash" /><span className="aisle-label"><ArrowRight size={12} /> DRIVE AISLE <ArrowRight size={12} /></span><span className="aisle-dash" /></div>
            <div className="parking-bank parking-bank-bottom">
              {visible.filter((space) => space.zone === 'C' || space.zone === 'D' || space.zone === 'E').map((space) => (
                <ParkingSpace key={space.id} space={space} selected={space.space_code === selected?.space_code} onSelect={() => setSelectedId(space.space_code)} />
              ))}
            </div>
            <div className="map-entrance"><Navigation size={11} /><span>ENTRY</span></div>
            {!visible.length && <div className="map-empty"><Search size={17} /><span>No spaces match your search.</span><button onClick={() => { setSearch(''); setFilter('all') }}>Clear filters</button></div>}
          </div>
          <div className="map-legend"><span><i className="legend-space legend-free" /> Available <b>{available}</b></span><span><i className="legend-space legend-busy" /> Occupied <b>{occupied}</b></span><span><i className="legend-space legend-selected" /> Your selection</span><span><i className="legend-wheelchair">♿</i> Accessible</span></div>
          <div className="selection-bar">
            <div className="selected-space-info">
              <span className={`selected-space-icon ${selected?.status?.toLowerCase() ?? 'available'}`}><MapPin size={16} /></span>
              <span>
                <small>{selected?.status === 'RESERVED' ? 'YOUR RESERVED SPACE' : 'SELECTED PARKING SPACE'}</small>
                <strong>{selected?.space_code ?? 'Select an available space'}</strong>
              </span>
            </div>
            <div className="selection-actions">
              {selected?.status === 'AVAILABLE' ? (
                <button className="reserve-button" onClick={reserveSpace}>Reserve space <ArrowRight size={14} /></button>
              ) : (
                <span className="occupied-label">{selected?.status === 'OCCUPIED' ? 'Space occupied' : 'Reserved'}</span>
              )}
            </div>
          </div>
        </article>

        <aside className="right-column">
          <article className="panel route-panel">
            <div className="panel-heading">
              <div><span className="section-kicker"><span className="route-kicker-dot" /> ROUTE PREVIEW</span><h2>Selected space route</h2></div>
              <span className="route-algorithm">A*</span>
            </div>
            <div className="route-preview">
              <div className="route-step"><span className="route-step-icon origin-icon"><LocateFixed size={15} /></span><span><small>STARTING POINT</small><strong>Car park entrance</strong></span></div>
              <div className="route-stem"><i /></div>
              <div className="route-step"><span className="route-step-icon destination-icon"><MapPin size={15} /></span><span><small>DESTINATION</small><strong>{selected?.space_code ?? 'Select a bay'}</strong></span></div>
              <svg className="mini-route" viewBox="0 0 180 38" preserveAspectRatio="none" aria-hidden="true">
                <path d={routeData.path.length > 1 ? 'M8 31 H52 V15 H112 V26 H171' : 'M8 19 H171'} />
                <circle cx="8" cy={routeData.path.length > 1 ? '31' : '19'} r="3" />
                <circle cx="171" cy={routeData.path.length > 1 ? '26' : '19'} r="4" />
              </svg>
              <div className="route-summary">
                {routeError ? <span>{routeError}</span> : <><span><Clock3 size={13} /> {routeData.estimated_time ?? 3} min walk</span><span>{routeData.distance ?? 48} m</span></>}
              </div>
              {!routeError && <p className="route-footnote"><Sparkles size={13} /> Estimated directions from the car park entrance.</p>}
            </div>
          </article>

          <article className="panel feed-panel">
            <div className="panel-heading">
              <div><span className="section-kicker">ACTIVITY STREAM</span><h2>System activity</h2></div>
              <span className="activity-mode">DEMO</span>
            </div>
            <div className="activity-feed">
              <div className="feed-item"><span className="feed-icon feed-camera"><Camera size={14} /></span><span className="feed-copy"><strong>Occupancy snapshot loaded</strong><small>Level 01 · {summary.occupied_spaces ?? occupied} of {summary.total_spaces ?? spaces.length} spaces occupied</small></span><time>NOW</time></div>
              <div className="feed-item"><span className="feed-icon feed-arrival"><CarFront size={15} /></span><span className="feed-copy"><strong>Vehicle detection sample</strong><small>Camera integration · demo event</small></span><time>DEMO</time></div>
              <div className="feed-item"><span className="feed-icon feed-route"><Navigation size={13} /></span><span className="feed-copy"><strong>Route preview available</strong><small>{selected ? `Selected bay · ${selected.space_code}` : 'Select a parking space'}</small></span><time>READY</time></div>
            </div>
          </article>
        </aside>
      </section>

      <section className="lower-grid" id="analytics">
        <article className="panel forecast-panel">
          <div className="panel-heading"><div><span className="section-kicker">DEMAND INTELLIGENCE</span><h2>Parking demand forecast</h2></div><span className="forecast-source"><i /> LSTM PREDICTION</span></div>
          <div className="forecast-summary"><strong>{peakForecast?.hour ?? '--:--'}</strong><span>Expected peak occupancy</span><span className="forecast-trend"><ArrowUpRight size={13} /> {peakForecast ? `${peakForecast.occupancy_percent}%` : 'N/A'} <small>predicted</small></span></div>
          <div className="chart-area"><div className="chart-guides"><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div><div className="chart-columns">{forecastData.map(({ hour, occupancy_percent: level }) => <div className={`chart-column ${Number(hour.slice(0, 2)) >= 16 ? 'forecast-column' : ''}`} key={hour}><div className="chart-bar-wrap"><i className="chart-bar" style={{ height: `${level}%` }} /></div><span className="chart-time">{hour.slice(0, 2)}</span></div>)}</div></div>
          <div className="chart-caption"><span><i className="chart-legend-observed" /> Historical occupancy</span><span><i className="chart-legend-forecast" /> Predicted demand</span><span className="caption-model">Backend forecast · simulation data</span></div>
        </article>

      </section>

      <footer className="page-footer"><span><span className="footer-mark">p.</span> PARKWISE <span className="footer-divider">·</span> SMART PARKING SYSTEM</span><span>VISION-POWERED PARKING <span className="footer-divider">·</span> SIMULATION DATA</span><button onClick={() => showNotice('Demo uses sample occupancy data. Connect a camera backend for live deployment.')}><CircleDot size={11} /> DEMO ENVIRONMENT</button></footer>
    </>
  )
}

function SpaceFinderPage({ showNotice = () => {} }) {
  const [vehicles, setVehicles] = useState([])
  const [spaces, setSpaces] = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [zone, setZone] = useState('')
  const [electricOnly, setElectricOnly] = useState(false)
  const [accessibleOnly, setAccessibleOnly] = useState(false)
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [reserving, setReserving] = useState(false)
  const [error, setError] = useState('')
  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === vehicleId)
  const recommendedSpace = spaces.find((space) => space.space_code === recommendation?.recommended_space)
  const availableSpaces = spaces.filter((space) => space.status === 'AVAILABLE')
  const accessibleSpaces = availableSpaces.filter((space) => space.accessibility)

  const findRecommendation = async (vehicle, selectedZone, ev, accessibility) => {
    setSearching(true)
    setError('')
    try {
      const response = await getParkingRecommendation({
        vehicle: vehicle?.vehicle_number,
        ev,
        accessibility,
        max_distance: 250,
        zone: selectedZone || undefined,
      })
      setRecommendation(response.data)
    } catch (err) {
      setRecommendation(null)
      setError(err.message || 'No matching space is available.')
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    Promise.all([getVehicles(), getParkingSpaces()])
      .then(([vehicleResponse, spaceResponse]) => {
        setVehicles(vehicleResponse.data)
        setSpaces(spaceResponse.data)
        const firstVehicle = vehicleResponse.data[0]
        if (!firstVehicle) return
        setVehicleId(String(firstVehicle.id))
        setElectricOnly(false)
        setAccessibleOnly(firstVehicle.accessibility_requirement)
        return findRecommendation(firstVehicle, '', false, firstVehicle.accessibility_requirement)
      })
      .catch((err) => setError(err.message || 'Unable to load vehicle and space data.'))
      .finally(() => setLoading(false))
  }, [])

  const submitSearch = (event) => {
    event.preventDefault()
    findRecommendation(selectedVehicle, zone, electricOnly, accessibleOnly)
  }

  const reserveSpace = async () => {
    if (!recommendedSpace || !selectedVehicle) return
    setReserving(true)
    try {
      await createReservation({ vehicle_id: selectedVehicle.id, parking_space_id: recommendedSpace.id })
      showNotice(`${recommendedSpace.space_code} reserved for ${selectedVehicle.vehicle_number}.`)
      setRecommendation(null)
    } catch (err) {
      setError(err.message || 'Unable to create reservation.')
    } finally {
      setReserving(false)
    }
  }

  const findAnyAvailable = () => {
    if (selectedVehicle?.accessibility_requirement) return
    setZone('')
    setElectricOnly(false)
    setAccessibleOnly(false)
    findRecommendation(selectedVehicle, '', false, false)
  }

  if (loading) return <LoadingCard message="Loading vehicles and available spaces..." />

  return (
    <section className="finder-page">
      <header className="page-intro">
        <div><p className="eyebrow"><span className="eyebrow-square"><MapPin size={12} /></span> PARKING OPERATIONS <span className="eyebrow-divider">/</span> SPACE FINDER</p><h1>Find a space<span className="heading-mark">.</span></h1><p className="intro-subtitle">Match a vehicle to an available bay and review its route.</p></div>
      </header>
      <div className="finder-layout">
        <form className="panel finder-controls" onSubmit={submitSearch}>
          <div className="finder-panel-heading"><span className="finder-icon"><SlidersHorizontal size={16} /></span><span><strong>Search preferences</strong><small>{availableSpaces.length} spaces available · {accessibleSpaces.length} accessible</small></span></div>
          <label className="finder-field"><span>Vehicle</span><select value={vehicleId} onChange={(event) => {
            const nextVehicle = vehicles.find((vehicle) => String(vehicle.id) === event.target.value)
            setVehicleId(event.target.value)
            setElectricOnly(Boolean(nextVehicle?.ev))
            setAccessibleOnly(Boolean(nextVehicle?.accessibility_requirement))
          }}><option value="">Choose a registered vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number} · {vehicle.vehicle_type}</option>)}</select></label>
          <label className="finder-field"><span>Preferred zone</span><select value={zone} onChange={(event) => setZone(event.target.value)}><option value="">Any zone</option>{['A', 'B', 'C', 'D', 'E'].map((item) => <option key={item} value={item}>Zone {item}</option>)}</select></label>
          <div className="finder-preferences">
            <label><span><strong>EV charging</strong><small>Prefer a charging bay</small></span><input type="checkbox" checked={electricOnly} onChange={(event) => setElectricOnly(event.target.checked)} /></label>
            <label><span><strong>Accessible bay</strong><small>{selectedVehicle?.accessibility_requirement ? 'Required by this vehicle' : 'Require step-free access'}</small></span><input type="checkbox" checked={accessibleOnly || Boolean(selectedVehicle?.accessibility_requirement)} disabled={Boolean(selectedVehicle?.accessibility_requirement)} onChange={(event) => setAccessibleOnly(event.target.checked)} /></label>
          </div>
          <button className="finder-submit" disabled={searching || !vehicleId}><Search size={15} /> {searching ? 'Searching availability...' : 'Find best match'}</button>
          <p className="finder-data-note"><Database size={13} /> Results use current parking-space records.</p>
        </form>

        <article className="panel finder-result">
          <div className="finder-result-heading"><div><span className="section-kicker">RECOMMENDATION</span><h2>{recommendation ? 'Best available match' : error ? 'No match for these filters' : 'Recommended space'}</h2></div><span className="finder-match-label">{recommendation ? 'AVAILABLE' : availableSpaces.length ? `${availableSpaces.length} OPEN` : 'FULL'}</span></div>
          {recommendation ? <>
            <div className="finder-space-highlight"><span className="finder-space-pin"><MapPin size={18} /></span><span><small>RECOMMENDED SPACE</small><strong>{recommendation.recommended_space}</strong><em>{recommendedSpace?.floor || 'Level 01'} · Zone {recommendedSpace?.zone || zone || 'A'}</em></span><span className="finder-space-price">₹{recommendation.current_price}<small>/ hour</small></span></div>
            <div className="finder-stats"><div><Timer size={15} /><span><strong>{recommendation.estimated_travel_time} min</strong><small>Est. walk</small></span></div><div><Navigation size={15} /><span><strong>{recommendation.distance} m</strong><small>From entrance</small></span></div><div><CarFront size={15} /><span><strong>{selectedVehicle?.vehicle_number}</strong><small>Selected vehicle</small></span></div></div>
            <div className="finder-route"><span className="section-kicker">ROUTE WAYPOINTS</span><div>{recommendation.route.map((step, index) => <span key={`${step}-${index}`}><b>{step}</b>{index < recommendation.route.length - 1 && <ArrowRight size={13} />}</span>)}</div></div>
            <button className="finder-reserve" disabled={!recommendedSpace || reserving} onClick={reserveSpace}>{reserving ? 'Reserving...' : 'Reserve this space'} <ArrowRight size={15} /></button>
          </> : <div className="finder-empty"><MapPin size={24} /><p>{error || 'Select a vehicle and search to see the best matching space.'}</p>{error && availableSpaces.length > 0 && !selectedVehicle?.accessibility_requirement && <button className="finder-fallback-button" onClick={findAnyAvailable}>Show any available space ({availableSpaces.length})</button>}</div>}
        </article>
      </div>
    </section>
  )
}

function DemandForecastPage() {
  const [forecastData, setForecastData] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([getAnalyticsDemand(), getDashboardSummary()])
      .then(([forecastResponse, summaryResponse]) => {
        setForecastData(forecastResponse.data)
        setSummary(summaryResponse.data)
      })
      .catch((err) => setError(err.message || 'Unable to load forecast data.'))
  }, [])
  const peak = forecastData.reduce((highest, point) => point.occupancy_percent > (highest?.occupancy_percent ?? -1) ? point : highest, null)
  const average = forecastData.length ? Math.round(forecastData.reduce((sum, point) => sum + point.occupancy_percent, 0) / forecastData.length) : 0
  const atCapacity = summary?.total_spaces ? Math.round((peak?.occupancy_percent ?? 0) * summary.total_spaces / 100) : 0
  return (
    <section className="data-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><BarChart3 size={12} /></span> PARKING INTELLIGENCE <span className="eyebrow-divider">/</span> FORECAST</p><h1>Demand forecast<span className="heading-mark">.</span></h1><p className="intro-subtitle">Hourly occupancy outlook for Northgate Centre.</p></div><span className="forecast-demo-tag"><i /> DEMO FORECAST</span></header>
      {error && <ErrorCard message={error} />}
      <div className="forecast-kpis">
        <article><small>EXPECTED PEAK</small><strong>{peak?.hour || '--:--'}</strong><span>{peak?.occupancy_percent ?? '—'}% estimated occupancy</span></article>
        <article><small>AVERAGE FORECAST</small><strong>{average}%</strong><span>Across {forecastData.length} hourly intervals</span></article>
        <article><small>SPACES AT PEAK</small><strong>{atCapacity}</strong><span>Of {summary?.total_spaces ?? '—'} total spaces</span></article>
      </div>
      <article className="panel data-chart-panel">
        <div className="data-panel-header"><div><span className="section-kicker">HOURLY CAPACITY</span><h2>Predicted occupancy</h2></div><span className="chart-source-tag">API forecast · sample model</span></div>
        <div className="forecast-chart-wrap"><ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecastData} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
            <defs><linearGradient id="forecastArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#75966c" stopOpacity={0.25}/><stop offset="95%" stopColor="#75966c" stopOpacity={0.02}/></linearGradient></defs>
            <CartesianGrid stroke="#edf0e9" vertical={false} />
            <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 10 }} interval={1} />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 10 }} unit="%" />
            <Tooltip formatter={(value) => [`${value}%`, 'Expected occupancy']} />
            {summary && <ReferenceLine y={summary.occupancy_rate} stroke="#d58b68" strokeDasharray="4 4" label={{ value: 'Current', fill: '#a97559', fontSize: 10 }} />}
            <Area type="monotone" dataKey="occupancy_percent" name="Forecast" stroke="#547c59" strokeWidth={2.5} fill="url(#forecastArea)" activeDot={{ r: 5, fill: '#547c59' }} />
          </AreaChart>
        </ResponsiveContainer></div>
        <div className="forecast-chart-foot"><span><i className="chart-key forecast-key" /> Forecast occupancy</span><span><i className="chart-key current-key" /> Current occupancy</span><span>Forecast values are seeded demo predictions.</span></div>
      </article>
    </section>
  )
}

function LivePipelinePage() {
  const [apiState, setApiState] = useState('Checking API')
  const [socketState, setSocketState] = useState('Connecting')
  const [aiStatus, setAiStatus] = useState(null)
  const [aiStatusError, setAiStatusError] = useState('')
  useEffect(() => {
    api.get('/health')
      .then((response) => setApiState(response.data.database === 'connected' ? 'Database connected' : 'Database unavailable'))
      .catch((error) => setApiState(error.message || 'API unavailable'))
    api.get('/ai/status')
      .then((response) => setAiStatus(response.data))
      .catch((error) => setAiStatusError(error.message || 'Unable to load AI status.'))
    const socketUrl = new URL(import.meta.env.VITE_WS_URL || '/ws/parking', new URL(api.defaults.baseURL, window.location.origin))
    socketUrl.protocol = ['https:', 'wss:'].includes(socketUrl.protocol) ? 'wss:' : 'ws:'
    const socket = new WebSocket(socketUrl)
    socket.onopen = () => setSocketState('Connected')
    socket.onclose = () => setSocketState('Disconnected')
    socket.onerror = () => setSocketState('Unavailable')
    return () => socket.close()
  }, [])
  const stepStatuses = ['Feed preview', aiStatus?.model_configured ? 'Model loaded' : 'Model not configured', apiState, 'Forecast demo', socketState === 'Connected' ? 'Socket ready' : socketState]
  return (
    <section className="data-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><Activity size={12} /></span> SYSTEM MONITORING <span className="eyebrow-divider">/</span> PIPELINE</p><p className="intro-subtitle">Camera input through to driver guidance.</p></div><span className="pipeline-mode-tag"><i className={socketState === 'Connected' ? 'is-online' : ''} /> {socketState === 'Connected' ? 'WEBSOCKET CONNECTED' : socketState.toUpperCase()}</span></header>
      <section className="panel pipeline-theatre">
        <div className="pipeline-theatre-heading"><span className="section-kicker">PARKWISE PROCESS FLOW</span><span>{apiState} · {aiStatus?.mode?.toUpperCase() || 'AI STATUS CHECKING'}</span></div>
        <div className="pipeline-theatre-flow">
          {stages.map(([Icon, title, detail], index) => <div className="pipeline-theatre-step" key={title}>
            <div className={`pipeline-theatre-node pipeline-node-${index}`}><span className="pipeline-step-index">0{index + 1}</span><Icon size={22} /></div>
            <strong>{title}</strong><small>{detail}</small><span className={`pipeline-theatre-status ${index === 1 && !aiStatus?.model_configured ? 'status-demo' : ''}`}><i />{stepStatuses[index]}</span>
            {index < stages.length - 1 && <span className="pipeline-theatre-connector"><i /></span>}
          </div>)}
        </div>
        <div className="pipeline-theatre-footer"><span><Camera size={14} /> Camera / IoT input</span><ArrowRight size={14} /><span><Database size={14} /> Database status update</span><ArrowRight size={14} /><span><Navigation size={14} /> Space and route output</span></div>
      </section>
      <div className="pipeline-monitor-grid">
        <article className="panel pipeline-monitor"><span className="monitor-mark"><Database size={17} /></span><small>DATABASE</small><strong>{apiState}</strong><p>Parking status and reservation records are served by the API.</p></article>
        <article className="panel pipeline-monitor"><span className="monitor-mark monitor-blue"><Activity size={17} /></span><small>WEBSOCKET</small><strong>{socketState}</strong><p>Live event stream at <code>/ws/parking</code>.</p></article>
        <article className="panel pipeline-monitor"><span className="monitor-mark monitor-gold"><Cpu size={17} /></span><small>INFERENCE</small><strong>{aiStatusError ? 'AI status unavailable' : aiStatus?.model_configured ? 'Model configured' : 'Demo mode'}</strong><p>{aiStatusError || `${aiStatus?.detection_samples ?? '—'} stored detection samples · ${aiStatus?.cameras_online ?? '—'} cameras online.`}</p></article>
      </div>
    </section>
  )
}

function ProjectOverviewPage() {
  const aimCards = [
    ['Project aim', 'Deliver an integrated, data-driven smart parking platform that detects space occupancy, forecasts demand, guides drivers, and gives administrators reliable operational insight.'],
    ['Problem statement', 'Manual parking monitoring causes inefficient space usage, avoidable congestion, delayed payments, duplicated reservations, and limited visibility across facilities.'],
    ['Proposed solution', 'Combine backend-managed parking records, camera-ready AI interfaces, occupancy forecasting, reservation workflows, route guidance, and real-time operational analytics.'],
  ]
  const objectives = [
    'Detect and classify available, occupied, reserved, and held parking spaces.',
    'Recommend suitable spaces using vehicle, accessibility, EV, zone, and distance requirements.',
    'Provide accurate occupancy forecasts without presenting unvalidated predictions as measured model results.',
    'Support reservations, payments, vehicle records, camera health, and facility administration.',
    'Record model evaluation outputs and display transparent performance limitations.',
    'Deliver responsive, accessible desktop and mobile operation.',
  ]
  const features = [
    ['Live occupancy', 'Real-time database-backed space status and facility utilization.'],
    ['Smart allocation', 'Preference-aware parking-space recommendations and A* route preview.'],
    ['Reservation control', 'Active reservation management with duplicate-state protection.'],
    ['AI readiness', 'YOLO/CNN/LSTM/OCR capability registry and evaluation history.'],
    ['Operations analytics', 'Space utilization, demand, revenue, duration, and vehicle activity.'],
    ['System monitoring', 'API, database, websocket, camera, and pipeline status.'],
  ]
  const technologies = [
    ['Frontend', 'React 19, React Router, Vite, Recharts, Lucide React'],
    ['Backend', 'FastAPI, Pydantic, SQLAlchemy, WebSockets, JWT'],
    ['Database', 'SQLite with SQLAlchemy models and automatic schema creation'],
    ['AI / Computer Vision', 'YOLO-ready, CNN-ready, LSTM-ready, OCR-ready integration'],
    ['Routing', 'A* pathfinding'],
    ['Deployment', 'Vite development server and local FastAPI service'],
  ]
  const limitations = [
    ['Camera quality', 'Position cameras to cover complete parking bays, avoid obstructions, glare, lens dirt, and recurring network blind spots.'],
    ['Lighting and weather', 'Low-light, rain, reflections, shadows, and glare can reduce detection confidence; use calibrated cameras and fallback checks.'],
    ['Incorrect detection', 'Review low-confidence detections before automated allocation. Never treat a demo confidence value as validated performance.'],
    ['Connectivity', 'Network outages can delay camera updates. A manual fallback, cached status, and retry mechanism should be operational.'],
    ['Database synchronization', 'All allocation paths should verify the latest space status before mutation or reservation confirmation.'],
    ['Prediction uncertainty', 'Forecasts are advisory and can change with traffic, events, closures, or unusual demand.'],
    ['Duplicate reservations', 'Reservation creation validates existing space status and should use database transactions and locking in production.'],
    ['User and payment security', 'Use HTTPS, strong password policies, least-privilege roles, encrypted secrets, token expiry, and PCI-compliant payment services.'],
    ['Emergency access', 'Security staff must retain an authenticated manual allocation and override workflow; prioritize emergency vehicles and accessibility needs.'],
  ]
  return (
    <section className="data-page overview-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><Building2 size={12} /></span> PROJECT INFORMATION <span className="eyebrow-divider">/</span> OVERVIEW</p><p className="intro-subtitle">Purpose, scope, solution architecture, expected outcomes, and operational precautions.</p></div><span className="forecast-demo-tag"><i /> EXISTING APPLICATION</span></header>
      <div className="project-aim-grid">{aimCards.map(([title, text]) => <article className="panel project-card" key={title}><small>{title}</small><p>{text}</p></article>)}</div>
      <div className="project-detail-grid">
        <article className="panel project-detail-card"><div className="data-panel-header"><div><span className="section-kicker">DELIVERY GOALS</span><h2>Project objectives</h2></div></div><div className="project-check-list">{objectives.map((item) => <div key={item}><span><Check size={12}/></span><p>{item}</p></div>)}</div></article>
        <article className="panel project-detail-card"><div className="data-panel-header"><div><span className="section-kicker">INCLUDED SCOPE</span><h2>Project scope</h2></div></div><p className="project-long-copy">The application covers facility-wide parking status, vehicle and reservation records, pricing, payments, camera registry, dashboard analytics, recommendation and routing, forecast visualization, model evaluation history, and test-result documentation. Physical camera deployment, model training, payment settlement, and external enterprise identity integration remain deployment-specific extensions.</p><div className="scope-pill-list"><span>Occupancy</span><span>Reservations</span><span>Vehicles</span><span>Payments</span><span>Forecasting</span><span>AI evaluation</span><span>Testing</span></div></article>
      </div>
      <article className="panel project-detail-card"><div className="data-panel-header"><div><span className="section-kicker">SYSTEM CAPABILITIES</span><h2>Key features</h2></div></div><div className="project-feature-grid">{features.map(([title, text]) => <div key={title}><span className="feature-icon"><Sparkles size={14}/></span><strong>{title}</strong><p>{text}</p></div>)}</div></article>
      <div className="project-detail-grid">
        <article className="panel project-detail-card"><div className="data-panel-header"><div><span className="section-kicker">IMPLEMENTATION</span><h2>Technologies used</h2></div></div><div className="technology-table">{technologies.map(([name, value]) => <div key={name}><strong>{name}</strong><span>{value}</span></div>)}</div></article>
        <article className="panel project-detail-card"><div className="data-panel-header"><div><span className="section-kicker">EXPECTED BENEFITS</span><h2>Expected outcomes</h2></div></div><div className="outcome-list"><div><strong>Reduced search time</strong><span>Drivers receive suitable bays and route previews quickly.</span></div><div><strong>Better capacity use</strong><span>Administrators see and respond to live availability patterns.</span></div><div><strong>Transparent AI operations</strong><span>Performance is shown only when real evaluation data exists.</span></div><div><strong>Safer operations</strong><span>Manual and emergency workflows remain available when automation is uncertain.</span></div></div></article>
      </div>
      <article className="panel project-detail-card precautions-panel"><div className="data-panel-header"><div><span className="section-kicker">PRECAUTIONS & LIMITATIONS</span><h2>Operational safety guidance</h2></div></div><div className="precaution-grid">{limitations.map(([title, text]) => <div key={title}><span><ShieldCheck size={14}/></span><strong>{title}</strong><p>{text}</p></div>)}</div></article>
    </section>
  )
}

function TestingEvaluationPage() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => {
    api.get('/testing/cases').then((response) => { setCases(response.data); setError('') }).catch((err) => setError(err.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])
  const updateCase = async (id, status, actual_result) => {
    try {
      await api.patch(`/testing/cases/${id}`, { status, actual_result })
      load()
    } catch (err) {
      setError(err.message || 'Unable to update the test case.')
    }
  }
  const passed = cases.filter((item) => item.status === 'PASS').length
  const failed = cases.filter((item) => item.status === 'FAIL').length
  const pending = cases.filter((item) => item.status === 'PENDING').length
  return (
    <section className="data-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><BadgeCheck size={12}/></span> QUALITY ASSURANCE <span className="eyebrow-divider">/</span> TESTING</p><p className="intro-subtitle">Test cases, expected results, actual results, and documented pass/fail status.</p></div><span className="forecast-demo-tag"><i/> DATABASE-TRACKED</span></header>
      {error && <ErrorCard message={error}/>}
      {loading ? <LoadingCard message="Loading test registry..."/> : <>
        <div className="testing-summary"><article><small>PASS</small><strong>{passed}</strong></article><article><small>FAIL</small><strong>{failed}</strong></article><article><small>PENDING</small><strong>{pending}</strong></article><article><small>TOTAL CASES</small><strong>{cases.length}</strong></article></div>
        <div className="testing-list">{cases.map((item) => <article className="panel test-case-card" key={item.id}>
          <div className="test-case-top"><span><small>{item.category}</small><strong>{item.name}</strong></span><span className={`test-status status-${item.status.toLowerCase()}`}>{item.status}</span></div>
          <p>{item.description}</p>
          <div className="test-case-results"><div><small>EXPECTED RESULT</small><span>{item.expected_result || 'Not documented'}</span></div><div><small>ACTUAL RESULT</small><span>{item.actual_result || 'Not executed yet'}</span></div></div>
          <div className="test-case-actions"><input defaultValue={item.actual_result === 'Not executed yet.' ? '' : item.actual_result || ''} placeholder="Record actual result" onBlur={(event) => event.target.value !== (item.actual_result || '') && updateCase(item.id, item.status, event.target.value)} /><button type="button" onClick={() => updateCase(item.id, 'PASS', item.actual_result)}>Mark pass</button><button type="button" className="test-fail-button" onClick={() => updateCase(item.id, 'FAIL', item.actual_result)}>Mark fail</button></div>
        </article>)}</div>
      </>}
    </section>
  )
}

function AIDatasetPage() {
  const [status, setStatus] = useState(null)
  const [spaces, setSpaces] = useState([])
  const [history, setHistory] = useState([])
  const [yoloDetectionHistory, setYoloDetectionHistory] = useState([])
  const [parkingModelComparison, setParkingModelComparison] = useState(null)
  const [yoloComparison, setYoloComparison] = useState(null)
  const [detectionSummary, setDetectionSummary] = useState(null)
  const [yoloSplit, setYoloSplit] = useState('test')
  const [evaluatingYolo, setEvaluatingYolo] = useState(false)
  const [yoloNotice, setYoloNotice] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    model_name: 'Parking occupancy classifier',
    model_type: 'parking_classification',
    dataset_name: '',
    true_positive: 0,
    true_negative: 0,
    false_positive: 0,
    false_negative: 0,
    map50: '',
    map50_95: '',
    iou: '',
    detection_confidence: '',
    fps: '',
    inference_ms: '',
    precision_recall_curve: '',
    actual_values: '',
    predicted_values: '',
  })
  useEffect(() => {
    Promise.all([
      api.get('/ai/status'),
      getParkingSpaces(),
      api.get('/ai/evaluations/history'),
      api.get('/ai/model-comparison'),
      getYoloComparison(),
      getDetectionSummary(30),
      getDetectionHistory(100),
    ])
      .then(([statusResponse, spacesResponse, historyResponse, parkingComparisonResponse, yoloComparisonResponse, detectionSummaryResponse, detectionHistoryResponse]) => {
        setStatus(statusResponse.data)
        setSpaces(spacesResponse.data)
        setHistory(historyResponse.data)
        setParkingModelComparison(parkingComparisonResponse.data)
        setYoloComparison(yoloComparisonResponse.data)
        setDetectionSummary(detectionSummaryResponse.data)
        setYoloDetectionHistory(detectionHistoryResponse.data)
      })
      .catch((err) => setError(err.message || 'Unable to load AI and dataset status.'))
  }, [])
  const reload = () => Promise.all([api.get('/ai/status'), api.get('/ai/evaluations/history')])
    .then(([statusResponse, historyResponse]) => { setStatus(statusResponse.data); setHistory(historyResponse.data); setError('') })
    .catch((err) => setError(err.message))
  const runYoloEvaluation = async () => {
    setEvaluatingYolo(true)
    setError('')
    setYoloNotice('')
    try {
      const evaluationResponse = await evaluateYoloModels(yoloSplit)
      const comparisonResponse = await getYoloComparison()
      setYoloComparison(comparisonResponse.data)
      setYoloNotice(`Evaluated ${evaluationResponse.data.comparison.length} configured YOLO model(s) on the ${evaluationResponse.data.split} split.`)
    } catch (err) {
      setError(err.message || 'Unable to evaluate configured YOLO models.')
    } finally {
      setEvaluatingYolo(false)
    }
  }
  const submitEvaluation = async (event) => {
    event.preventDefault()
    try {
      let precision_recall_curve = null
      if (form.precision_recall_curve.trim()) {
        precision_recall_curve = JSON.parse(form.precision_recall_curve)
        if (!Array.isArray(precision_recall_curve)) throw new Error('Precision-recall data must be a JSON array.')
      }
      const parseValues = (value) => value.trim().split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item))
      const payload = {
        model_name: form.model_name,
        model_type: form.model_type,
        dataset_name: form.dataset_name || null,
        confusion_matrix: {
          true_positive: Number(form.true_positive),
          true_negative: Number(form.true_negative),
          false_positive: Number(form.false_positive),
          false_negative: Number(form.false_negative),
        },
      }
      if (form.model_type === 'vehicle_detection') {
        payload.confusion_matrix = null
        payload.detection_metrics = {
          map50: form.map50 === '' ? null : Number(form.map50) / 100,
          map50_95: form.map50_95 === '' ? null : Number(form.map50_95) / 100,
          iou: form.iou === '' ? null : Number(form.iou) / 100,
          detection_confidence: form.detection_confidence === '' ? null : Number(form.detection_confidence) / 100,
          fps: form.fps === '' ? null : Number(form.fps),
          inference_ms: form.inference_ms === '' ? null : Number(form.inference_ms),
          precision_recall_curve,
        }
      }
      if (form.model_type === 'occupancy_prediction') {
        payload.confusion_matrix = null
        payload.prediction_metrics = {
          actual: form.actual_values === '' ? null : parseValues(form.actual_values),
          predicted: form.predicted_values === '' ? null : parseValues(form.predicted_values),
        }
      }
      await api.post('/ai/evaluations', payload)
      await reload()
      setShowForm(false)
    } catch (err) {
      setError(err.message || 'Unable to store the evaluation.')
    }
  }
  const classCounts = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'HELD'].map((label) => ({
    label,
    count: spaces.filter((space) => space.status === label).length,
  }))
  const modelStatuses = [
    ['YOLOv8', 'Vehicle object detection', status?.model_configured ? 'Weights available' : 'Weights not configured', Boolean(status?.model_configured)],
    ['CNN', 'Space-state classification', 'Demo only', false],
    ['LSTM', 'Occupancy forecast', 'Seeded predictions', false],
    ['A*', 'Route planning', 'API available', true],
    ['OCR', 'Vehicle plate recognition', 'Not configured', false],
  ]
  const metrics = status?.metrics || {}
  const split = status?.dataset_split || {}
  const matrix = status?.confusion_matrix || {}
  const metricCards = [
    ['ACCURACY', metrics.accuracy, '%', 'Correct predictions'],
    ['PRECISION', metrics.precision, '%', 'Avoid false occupied detections'],
    ['RECALL', metrics.recall, '%', 'Sensitivity / detected positives'],
    ['F1 SCORE', metrics.f1_score, '%', 'Precision-recall balance'],
    ['SPECIFICITY', metrics.specificity, '%', 'Correct negative predictions'],
    ['ERROR RATE', metrics.error_rate, '%', 'Incorrect prediction proportion'],
  ]
  const evaluatedYoloModels = (yoloComparison?.comparison || []).filter((model) => model.metrics)
  const yoloMetricRows = evaluatedYoloModels.map((model) => ({
    model: model.model_name,
    Precision: model.metrics.precision == null ? null : model.metrics.precision * 100,
    Recall: model.metrics.recall == null ? null : model.metrics.recall * 100,
    'F1-score': model.metrics.f1_score == null ? null : model.metrics.f1_score * 100,
    'mAP@0.5': model.metrics.map50 == null ? null : model.metrics.map50 * 100,
    'mAP@0.5:0.95': model.metrics.map50_95 == null ? null : model.metrics.map50_95 * 100,
  }))
  const yoloChartModels = yoloMetricRows.length ? yoloMetricRows : [
    { model: 'YOLOv8n' },
    { model: 'YOLOv8s' },
    { model: 'YOLOv8m' },
    { model: 'YOLOv8l' },
  ]
  const yoloChartHasResults = yoloMetricRows.length > 0
  const vehicleDistribution = [
    { name: 'Car', value: detectionSummary?.vehicle_distribution?.car || 0, color: '#638461' },
    { name: 'Motorcycle', value: detectionSummary?.vehicle_distribution?.motorcycle || 0, color: '#d4876c' },
    { name: 'Bus', value: detectionSummary?.vehicle_distribution?.bus || 0, color: '#719cb3' },
    { name: 'Truck', value: detectionSummary?.vehicle_distribution?.truck || 0, color: '#d2a44f' },
  ]
  const detectionTimeline = detectionSummary?.detection_timeline || []
  const yoloObservedRows = [...yoloDetectionHistory].reverse().map((record) => ({
    time: new Date(record.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    confidence: Number(record.confidence) * 100,
    inference_ms: Number(record.inference_ms),
    vehicle: record.vehicle_class,
  }))
  const parkingClassifierRows = (parkingModelComparison?.comparison || []).map((model) => ({
    model: model.model_name,
    Accuracy: model.accuracy,
    Precision: model.precision,
    Recall: model.recall,
    'F1-score': model.f1_score,
  }))
  const combinedModelMetricRows = [
    ...parkingClassifierRows,
    ...evaluatedYoloModels.map((model) => ({
      model: `${model.model_name} (YOLO${model.model_name === yoloComparison?.best_model ? ' · BEST' : ''})`,
      isYolo: true,
      isBestYolo: model.model_name === yoloComparison?.best_model,
      Precision: model.metrics.precision == null ? null : model.metrics.precision * 100,
      Recall: model.metrics.recall == null ? null : model.metrics.recall * 100,
      'F1-score': model.metrics.f1_score == null ? null : model.metrics.f1_score * 100,
    })),
  ]
  const modelAccuracyRows = [
    ...parkingClassifierRows,
    ...evaluatedYoloModels.map((model) => ({
      model: `${model.model_name} (YOLO${model.model_name === yoloComparison?.best_model ? ' · BEST' : ''})`,
      isYolo: true,
      isBestYolo: model.model_name === yoloComparison?.best_model,
      Accuracy: null,
      'YOLO mAP@0.5': model.metrics.map50 == null ? null : model.metrics.map50 * 100,
    })),
  ]
  const bestYoloModel = evaluatedYoloModels.find((model) => model.model_name === yoloComparison?.best_model)
    || (evaluatedYoloModels.length === 1 ? evaluatedYoloModels[0] : null)
  const selectedYoloMetrics = bestYoloModel?.metrics
  const yoloPerClassRows = selectedYoloMetrics?.per_class || []
  const yoloPrecisionRecallRows = selectedYoloMetrics?.precision_recall_curve || []
  const yoloLossRows = selectedYoloMetrics?.loss_history || []
  const yoloConfusionMatrix = bestYoloModel?.confusion_matrix
  const yoloConfusionMax = yoloConfusionMatrix?.values.reduce(
    (max, row) => Math.max(max, ...row.map(Number)),
    1,
  ) || 1
  const parkingClassDistribution = [
    { name: 'Available', value: parkingModelComparison?.dataset?.distribution?.available || 0 },
    { name: 'Occupied', value: parkingModelComparison?.dataset?.distribution?.occupied || 0 },
  ]
  const bestParkingClassifier = parkingModelComparison?.best_model
    ? parkingModelComparison.comparison?.find((model) => model.model_name === parkingModelComparison.best_model)
    : null
  return (
    <section className="data-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><Cpu size={12} /></span> MODEL OPERATIONS <span className="eyebrow-divider">/</span> DATASET</p><h1>AI & dataset<span className="heading-mark">.</span></h1><p className="intro-subtitle">Model readiness, real evaluation metrics, and date-wise performance history.</p></div><div className="page-intro-actions"><button className="reserve-button" type="button" onClick={() => setShowForm((open) => !open)}><Plus size={14} /> Add evaluation</button><span className="ai-mode-tag">{status?.mode?.toUpperCase() || 'LOADING'} MODE</span></div></header>
      {showForm && <form className="panel evaluation-form" onSubmit={submitEvaluation}>
        <div className="data-panel-header"><div><span className="section-kicker">REAL TEST RESULTS</span><h2>Record classification evaluation</h2></div><button className="icon-button" type="button" onClick={() => setShowForm(false)} aria-label="Close evaluation form"><X size={15} /></button></div>
        <div className="evaluation-form-grid">
          <label><span>Model name</span><input value={form.model_name} onChange={(event) => setForm({ ...form, model_name: event.target.value })} required /></label>
          <label><span>Model type</span><select value={form.model_type} onChange={(event) => setForm({ ...form, model_type: event.target.value })}><option value="parking_classification">Parking classification</option><option value="vehicle_detection">Vehicle detection</option><option value="occupancy_prediction">Occupancy prediction</option></select></label>
          <label><span>Dataset name</span><input value={form.dataset_name} onChange={(event) => setForm({ ...form, dataset_name: event.target.value })} placeholder="Dataset, version or run identifier" /></label>
          {form.model_type === 'parking_classification' && ['true_positive', 'true_negative', 'false_positive', 'false_negative'].map((key) => <label key={key}><span>{key.replaceAll('_', ' ')}</span><input type="number" min="0" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required /></label>)}
          {form.model_type === 'vehicle_detection' && <>
            {[['map50','mAP@0.5 (%)'],['map50_95','mAP@0.5:0.95 (%)'],['iou','IoU (%)'],['detection_confidence','Detection confidence (%)'],['fps','Detection speed (FPS)'],['inference_ms','Inference time (ms)']].map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min="0" step="0.01" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
            <label className="evaluation-wide-field"><span>Precision-recall curve JSON</span><input value={form.precision_recall_curve} onChange={(event) => setForm({ ...form, precision_recall_curve: event.target.value })} placeholder='[{"recall":90,"precision":95}]' /></label>
          </>}
          {form.model_type === 'occupancy_prediction' && <>
            <label className="evaluation-wide-field"><span>Actual occupancy values (comma separated)</span><input value={form.actual_values} onChange={(event) => setForm({ ...form, actual_values: event.target.value })} placeholder="20, 35, 50, 65" /></label>
            <label className="evaluation-wide-field"><span>Predicted occupancy values (comma separated)</span><input value={form.predicted_values} onChange={(event) => setForm({ ...form, predicted_values: event.target.value })} placeholder="18, 37, 48, 64" /></label>
          </>}
        </div>
        <div className="evaluation-form-actions"><span>Metrics are calculated mathematically by the backend.</span><button className="reserve-button" type="submit"><Save size={14} /> Store evaluation</button></div>
      </form>}
      {error && <ErrorCard message={error} />}
      <div className="ai-metrics">
        <article><small>SPACE RECORDS</small><strong>{status?.parking_spaces_labeled ?? '—'}</strong><span>Current database rows</span></article>
        <article><small>DETECTION SAMPLES</small><strong>{status?.detection_samples ?? '—'}</strong><span>Stored camera detections</span></article>
        <article><small>FORECAST POINTS</small><strong>{status?.prediction_points ?? '—'}</strong><span>Hourly prediction rows</span></article>
        <article><small>MEAN CONFIDENCE</small><strong>{status?.average_detection_confidence == null ? '—' : `${status.average_detection_confidence}%`}</strong><span>Stored samples only</span></article>
      </div>
      <section className="ai-evaluation-grid">
        <article className="panel ai-performance-panel">
          <div className="data-panel-header"><div><span className="section-kicker">MODEL EVALUATION</span><h2>Production quality targets</h2></div><span className={`evaluation-state ${status?.performance_validated ? 'validated' : ''}`}>{status?.performance_validated ? 'VALIDATED' : 'AWAITING TEST LABELS'}</span></div>
          <div className="ai-performance-metrics">{metricCards.map(([label, value, unit, description]) =>
            <div className="ai-performance-card" key={label}><small>{label}</small><strong>{value == null || value === undefined ? 'Not Evaluated Yet' : `${value}${unit}`}</strong><span>Calculated from TP, TN, FP and FN</span><p>{description}</p></div>
          )}</div>
        </article>
        <article className="panel ai-confusion-panel">
          <div className="data-panel-header"><div><span className="section-kicker">TEST RESULTS</span><h2>Confusion matrix</h2></div><span className="chart-source-tag">{status?.performance_validated ? 'TEST SET' : 'NOT VALIDATED'}</span></div>
          <div className="confusion-matrix">
            <span /><span className="matrix-axis">PREDICTED</span><span />
            <span className="matrix-axis matrix-axis-row">ACTUAL</span><div className="matrix-cell matrix-true"><strong>{matrix.true_positive ?? '—'}</strong><span>True positive</span></div><div className="matrix-cell matrix-false"><strong>{matrix.false_positive ?? '—'}</strong><span>False positive</span></div>
            <span /><div className="matrix-cell matrix-false"><strong>{matrix.false_negative ?? '—'}</strong><span>False negative</span></div><div className="matrix-cell matrix-true"><strong>{matrix.true_negative ?? '—'}</strong><span>True negative</span></div>
          </div>
        </article>
      </section>
      <section className="ai-evaluation-grid ai-extended-grid">
        <article className="panel ai-object-panel">
          <div className="data-panel-header"><div><span className="section-kicker">YOLO / OBJECT DETECTION</span><h2>Detection performance</h2></div><span className="chart-source-tag">{status?.detection_metrics ? 'EVALUATED' : 'NOT EVALUATED'}</span></div>
          <div className="detection-metric-grid">{[
            ['mAP@0.5', status?.detection_metrics?.map50, '%'],
            ['mAP@0.5:0.95', status?.detection_metrics?.map50_95, '%'],
            ['IoU', status?.detection_metrics?.iou, '%'],
            ['Detection confidence', status?.detection_metrics?.detection_confidence, '%'],
            ['Detection speed', status?.detection_metrics?.fps, ' FPS'],
            ['Inference time', status?.detection_metrics?.inference_ms, ' ms'],
          ].map(([label, value, unit]) => <div key={label}><small>{label}</small><strong>{value == null ? 'Not Evaluated Yet' : `${value}${unit}`}</strong></div>)}</div>
          <div className="curve-chart">
            {status?.precision_recall_curve?.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={status.precision_recall_curve} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="recall" tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill:'#838b80', fontSize:8 }}/><YAxis domain={[0,100]} tickFormatter={(value) => `${value}%`} tick={{ fill:'#838b80', fontSize:8 }}/><Tooltip formatter={(value) => [`${value}%`, 'Precision']}/><Line type="monotone" dataKey="precision" stroke="#638461" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer> : <div className="chart-empty-state"><Activity size={18}/><span>Precision-recall curve not evaluated yet</span></div>}
          </div>
        </article>
        <article className="panel ai-object-panel">
          <div className="data-panel-header"><div><span className="section-kicker">PARKING PREDICTION</span><h2>Regression evaluation</h2></div><span className="chart-source-tag">{status?.prediction_metrics ? 'EVALUATED' : 'NOT EVALUATED'}</span></div>
          <div className="detection-metric-grid">{[
            ['MAE', status?.prediction_metrics?.mae],
            ['MSE', status?.prediction_metrics?.mse],
            ['RMSE', status?.prediction_metrics?.rmse],
            ['R² Score', status?.prediction_metrics?.r2_score],
          ].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value == null ? 'Not Evaluated Yet' : value}</strong></div>)}</div>
          <div className="curve-chart">
            {status?.actual_vs_predicted?.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={status.actual_vs_predicted} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="index" tick={{ fill:'#838b80', fontSize:8 }}/><YAxis tick={{ fill:'#838b80', fontSize:8 }}/><Tooltip/><Line type="monotone" dataKey="actual" name="Actual" stroke="#638461" strokeWidth={2}/><Line type="monotone" dataKey="predicted" name="Predicted" stroke="#d4876c" strokeWidth={2}/><Line type="monotone" dataKey="error" name="Error" stroke="#8da4b0" strokeDasharray="4 4" dot={false}/></LineChart></ResponsiveContainer> : <div className="chart-empty-state"><BarChart3 size={18}/><span>Actual vs predicted data not evaluated yet</span></div>}
          </div>
        </article>
      </section>
      <section className="research-evaluation-section">
        <div className="research-section-head">
          <div><span className="section-kicker">PARKING & YOLO MODEL COMPARISON</span><h2>Compare evaluated parking and YOLO models</h2><p>{parkingModelComparison?.dataset?.name || 'Parking availability dataset'} · classification and object-detection metrics are labeled separately</p></div>
          <span className="chart-source-tag">{parkingModelComparison?.comparison?.length ? 'MEASURED DATA' : 'NO EVALUATION DATA'}</span>
        </div>
        <div className="research-summary-grid">
          <article><small>LABELED IMAGES</small><strong>{parkingModelComparison?.dataset?.record_count ?? 'Evaluation data unavailable'}</strong><span>Available and occupied parking spaces</span></article>
          <article><small>TEST SET</small><strong>{parkingModelComparison?.dataset_split?.test ?? '—'}</strong><span>{parkingModelComparison?.dataset_split?.test_percent ?? '—'}% held out for testing</span></article>
          <article><small>BEST YOLO MODEL</small><strong>{yoloComparison?.best_model || 'Not evaluated'}</strong><span>Ranked by measured mAP@0.5:0.95</span></article>
        </div>
        {combinedModelMetricRows.length ? <div className="research-chart-grid">
          <article className="panel model-comparison-chart"><div className="data-panel-header"><div><span className="section-kicker">MODEL PERFORMANCE</span><h2>Model accuracy and detection quality</h2></div></div><div className="research-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={modelAccuracyRows} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="model" tick={{fill:'#838b80',fontSize:9}}/><YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tickFormatter={(value)=>`${value}%`} tick={{fill:'#838b80',fontSize:9}}/><Tooltip formatter={(value, name)=>value == null ? ['Not evaluated',name] : [`${Number(value).toFixed(2)}%`,name]}/><Legend/><Bar dataKey="Accuracy" fill="#638461" shape={ModelComparisonBar} radius={[4,4,0,0]}/><Bar dataKey="YOLO mAP@0.5" fill="#719cb3" shape={ModelComparisonBar} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div><p className="yolo-chart-note">Parking-model bars show classification accuracy. Wider highlighted YOLO bars show mAP@0.5; the top-ranked YOLO model is outlined. These are distinct metrics.</p></article>
          <article className="panel model-comparison-chart"><div className="data-panel-header"><div><span className="section-kicker">CLASSIFICATION & DETECTION METRICS</span><h2>Precision, recall and F1-score</h2></div></div><div className="research-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={combinedModelMetricRows} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="model" tick={{fill:'#838b80',fontSize:9}}/><YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tickFormatter={(value)=>`${value}%`} tick={{fill:'#838b80',fontSize:9}}/><Tooltip formatter={(value)=>value == null ? ['Not evaluated'] : [`${Number(value).toFixed(2)}%`]}/><Legend/><Bar dataKey="Precision" fill="#638461" shape={ModelComparisonBar}/><Bar dataKey="Recall" fill="#d4876c" shape={ModelComparisonBar}/><Bar dataKey="F1-score" fill="#8da4b0" shape={ModelComparisonBar}/></BarChart></ResponsiveContainer></div><p className="yolo-chart-note">Parking scores come from the occupancy test set; wider highlighted YOLO bars come from IoU-based vehicle-detection evaluation.</p></article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">TEST DATA LABELS</span><h2>Available vs occupied</h2></div></div><div className="research-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={parkingClassDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={78} paddingAngle={3}><Cell key="available" fill="#638461"/><Cell key="occupied" fill="#d4876c"/></Pie><Tooltip formatter={(value)=>[`${value} labeled images`]}/><Legend/></PieChart></ResponsiveContainer></div></article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">BEST MEASURED CLASSIFIER</span><h2>{bestParkingClassifier?.model_name || 'Model metrics'}</h2></div></div><div className="selected-model-metrics">{bestParkingClassifier ? [['Accuracy',bestParkingClassifier.accuracy],['Precision',bestParkingClassifier.precision],['Recall',bestParkingClassifier.recall],['F1-score',bestParkingClassifier.f1_score]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value == null ? '—' : `${value}%`}</strong></div>) : <div className="chart-empty-state">Evaluation data unavailable</div>}</div></article>
        </div> : <div className="chart-empty-state history-empty"><Database size={18}/><span>Parking and YOLO evaluation data unavailable.</span></div>}
        <p className="yolo-chart-note">Parking and YOLO results are shown together for convenience, but each is measured on its own labeled test set. YOLO is an object detector, so classification accuracy is not applicable.</p>
      </section>

      <section className="research-evaluation-section">
        <div className="research-section-head">
          <div><span className="section-kicker">YOLO VEHICLE DETECTION</span><h2>ParkWise model evaluation</h2><p>IoU-based object-detection metrics from the configured YOLO model and labeled dataset. These are not occupancy-classification scores.</p></div>
          <div className="research-yolo-actions">
            <label>Evaluation split<select value={yoloSplit} onChange={(event) => setYoloSplit(event.target.value)}><option value="test">Test</option><option value="validation">Validation</option></select></label>
            <button className="reserve-button" type="button" onClick={runYoloEvaluation} disabled={evaluatingYolo}><Activity size={14}/>{evaluatingYolo ? 'Evaluating YOLO…' : 'Evaluate YOLO Model'}</button>
          </div>
        </div>
        {yoloNotice && <div className="yolo-notice" role="status">{yoloNotice}</div>}
        <div className="research-summary-grid">
          <article><small>EVALUATION DATA</small><strong>{yoloComparison?.dataset_name || 'Not Evaluated'}</strong><span>{yoloComparison?.split ? `${yoloComparison.split} split` : yoloComparison?.dataset_available ? 'Select a split and run evaluation' : 'Labeled detection dataset unavailable'}</span></article>
          <article><small>HARDWARE</small><strong>{yoloComparison?.hardware || 'Not evaluated'}</strong><span>Same device for this comparison</span></article>
          <article><small>BEST YOLO MODEL</small><strong>{yoloComparison?.best_model || 'Not evaluated'}</strong><span>Ranked by measured mAP@0.5:0.95</span></article>
        </div>
        <div className="research-yolo-metrics">
          {[
            ['Precision', selectedYoloMetrics?.precision],
            ['Recall', selectedYoloMetrics?.recall],
            ['F1-score', selectedYoloMetrics?.f1_score],
            ['mAP@50', selectedYoloMetrics?.map50],
            ['mAP@50-95', selectedYoloMetrics?.map50_95],
          ].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value == null ? 'Not Evaluated' : `${(Number(value) * 100).toFixed(2)}%`}</strong><span>{bestYoloModel?.model_name || 'YOLO object detection'}</span></article>)}
        </div>
        <div className="research-chart-grid">
          <article className={`panel ${!yoloChartHasResults ? 'research-chart-placeholder-panel' : ''}`}><div className="data-panel-header"><div><span className="section-kicker">YOLO MODEL COMPARISON</span><h2>Detection quality by model</h2></div></div>
            <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={yoloChartModels} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="model" tick={{fill:'#838b80',fontSize:9}}/><YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tickFormatter={(value)=>`${value}%`} tick={{fill:'#838b80',fontSize:9}}/><Tooltip formatter={(value)=>value == null ? ['Not evaluated'] : [`${Number(value).toFixed(2)}%`]}/><Legend/><Bar dataKey="Precision" fill="#638461"/><Bar dataKey="Recall" fill="#d4876c"/><Bar dataKey="F1-score" fill="#8da4b0"/></BarChart></ResponsiveContainer>{!yoloChartHasResults && <div className="research-chart-overlay">YOLO results will appear after evaluation</div>}</div>
          </article>
          <article className={`panel ${!yoloChartHasResults ? 'research-chart-placeholder-panel' : ''}`}><div className="data-panel-header"><div><span className="section-kicker">OBJECT DETECTION</span><h2>mAP@0.5 and mAP@0.5:0.95</h2></div></div>
            <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={yoloChartModels} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="model" tick={{fill:'#838b80',fontSize:9}}/><YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tickFormatter={(value)=>`${value}%`} tick={{fill:'#838b80',fontSize:9}}/><Tooltip formatter={(value)=>value == null ? ['Not evaluated'] : [`${Number(value).toFixed(2)}%`]}/><Legend/><Bar dataKey="mAP@0.5" fill="#719cb3"/><Bar dataKey="mAP@0.5:0.95" fill="#638461"/></BarChart></ResponsiveContainer>{!yoloChartHasResults && <div className="research-chart-overlay">mAP values require labeled test data</div>}</div>
          </article>
          <article className={`panel ${!yoloChartHasResults ? 'research-chart-placeholder-panel' : ''}`}><div className="data-panel-header"><div><span className="section-kicker">SPEED / ACCURACY TRADE-OFF</span><h2>Inference time and FPS</h2></div></div>
            <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={yoloChartHasResults ? evaluatedYoloModels.map((model)=>({model:model.model_name,inference_ms:model.metrics.inference_ms,fps:model.metrics.fps})) : yoloChartModels} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="model" tick={{fill:'#838b80',fontSize:9}}/><YAxis yAxisId="left" name="Inference (ms)" tick={{fill:'#838b80',fontSize:9}}/><YAxis yAxisId="right" name="FPS" orientation="right" tick={{fill:'#838b80',fontSize:9}}/><Tooltip/><Legend/><Bar yAxisId="left" dataKey="inference_ms" name="Inference (ms)" fill="#d4876c"/><Line yAxisId="right" type="monotone" dataKey="fps" name="FPS" stroke="#719cb3" strokeWidth={2} dot={{r:3}}/></ComposedChart></ResponsiveContainer>{!yoloChartHasResults && <div className="research-chart-overlay">Measured speed values are not available</div>}</div>
          </article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">PRECISION–RECALL</span><h2>Mean precision-recall curve</h2></div><span className="chart-source-tag">IoU 0.50 · {yoloComparison?.split || 'Not evaluated'}</span></div>
            {yoloPrecisionRecallRows.length
              ? <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={yoloPrecisionRecallRows} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="recall" type="number" domain={[0,1]} tickFormatter={(value)=>`${Math.round(value*100)}%`} label={{value:'Recall',position:'insideBottom',offset:-5,fontSize:9}} tick={{fill:'#838b80',fontSize:9}}/><YAxis domain={[0,1]} tickFormatter={(value)=>`${Math.round(value*100)}%`} label={{value:'Precision',angle:-90,position:'insideLeft',fontSize:9}} tick={{fill:'#838b80',fontSize:9}}/><Tooltip formatter={(value)=>`${(Number(value)*100).toFixed(2)}%`}/><Line type="monotone" dataKey="precision" name="Mean precision" stroke="#638461" strokeWidth={2} dot={false} activeDot={{r:4}}/></LineChart></ResponsiveContainer></div>
              : <div className="chart-empty-state history-empty"><Activity size={18}/><span>Not Evaluated — precision-recall data is unavailable.</span></div>}
          </article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">PER-CLASS DETECTION</span><h2>Class performance at IoU thresholds</h2></div><span className="chart-source-tag">{yoloPerClassRows.length ? `${yoloPerClassRows.length} labeled classes` : 'Not evaluated'}</span></div>
            {yoloPerClassRows.length
              ? <div className="research-chart yolo-class-chart" style={{height:Math.max(250,Math.min(850,yoloPerClassRows.length*25))}}><ResponsiveContainer width="100%" height="100%"><BarChart data={yoloPerClassRows.map((row)=>({...row,ap50_percent:row.ap50*100,map50_95_percent:row.map50_95*100}))} layout="vertical" margin={{top:8,right:14,left:8,bottom:8}}><CartesianGrid stroke="#edf0e9" horizontal={false}/><XAxis type="number" domain={[0,100]} tickFormatter={(value)=>`${value}%`} label={{value:'Average precision',position:'insideBottom',offset:-4,fontSize:9}} tick={{fill:'#838b80',fontSize:9}}/><YAxis type="category" dataKey="class_name" width={95} tick={{fill:'#697568',fontSize:8}}/><Tooltip formatter={(value,name)=>[`${Number(value).toFixed(2)}%`,name]} labelFormatter={(label)=>`${label} · ${yoloPerClassRows.find((row)=>row.class_name===label)?.instances ?? 0} instances`}/><Legend/><Bar dataKey="ap50_percent" name="AP@50" fill="#638461"/><Bar dataKey="map50_95_percent" name="AP@50-95" fill="#d4876c"/></BarChart></ResponsiveContainer></div>
              : <div className="chart-empty-state history-empty"><Activity size={18}/><span>Not Evaluated — class AP requires labeled validation/test instances.</span></div>}
          </article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">YOLO TRAINING HISTORY</span><h2>Training and validation loss</h2></div><span className="chart-source-tag">{yoloLossRows.length ? `${yoloLossRows.length} epochs` : 'Not available'}</span></div>
            {yoloLossRows.length
              ? <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={yoloLossRows} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="epoch" label={{value:'Epoch',position:'insideBottom',offset:-5,fontSize:9}} tick={{fill:'#838b80',fontSize:9}}/><YAxis label={{value:'Loss',angle:-90,position:'insideLeft',fontSize:9}} tick={{fill:'#838b80',fontSize:9}}/><Tooltip/><Legend/><Line type="monotone" dataKey="training_loss" name="Training loss" stroke="#638461" strokeWidth={2} dot={false} connectNulls={false}/><Line type="monotone" dataKey="validation_loss" name="Validation loss" stroke="#d4876c" strokeWidth={2} dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div>
              : <div className="chart-empty-state history-empty"><Activity size={18}/><span>Not available — no training results.csv is associated with this checkpoint. Validation does not produce training loss.</span></div>}
          </article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">OBJECT DETECTION ERRORS</span><h2>Confusion matrix heatmap</h2></div><span className="chart-source-tag">{yoloConfusionMatrix ? `${yoloConfusionMatrix.labels.length} active labels` : 'Not evaluated'}</span></div>
            {yoloConfusionMatrix?.values?.length
              ? <div className="yolo-confusion-heatmap"><table><caption>Rows are actual classes; columns are predicted classes, including background.</caption><thead><tr><th>Actual / predicted</th>{yoloConfusionMatrix.labels.map((label)=><th key={`column-${label}`}>{label}</th>)}</tr></thead><tbody>{yoloConfusionMatrix.values.map((row,rowIndex)=><tr key={`row-${yoloConfusionMatrix.labels[rowIndex]}`}><th>{yoloConfusionMatrix.labels[rowIndex]}</th>{row.map((value,columnIndex)=>{const alpha=0.12+0.78*(Number(value)/yoloConfusionMax);const fill=rowIndex===columnIndex?`rgba(91,150,109,${alpha})`:`rgba(219,118,87,${alpha})`;return <td key={`${rowIndex}-${columnIndex}`} title={`Actual ${yoloConfusionMatrix.labels[rowIndex]}, predicted ${yoloConfusionMatrix.labels[columnIndex]}: ${value}`} style={{backgroundColor:fill}}>{value}</td>})}</tr>)}</tbody></table></div>
              : <div className="chart-empty-state history-empty"><Activity size={18}/><span>Not Evaluated — confusion matrix data is unavailable.</span></div>}
          </article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">SAVED YOLO DETECTIONS</span><h2>Vehicle class distribution</h2></div><span className="chart-source-tag">Last 30 days</span></div>
            {detectionSummary?.detected_vehicles_period > 0
              ? <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={vehicleDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={78} paddingAngle={3}>{vehicleDistribution.map((item) => <Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip formatter={(value) => [`${value} detections`]}/><Legend/></PieChart></ResponsiveContainer></div>
              : <div className="chart-empty-state history-empty"><Activity size={18}/><span>Vehicle class chart will populate from saved YOLO detections.</span></div>}
          </article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">SAVED YOLO DETECTIONS</span><h2>Detection count over time</h2></div><span className="chart-source-tag">Last 30 days</span></div>
            {detectionTimeline.length
              ? <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={detectionTimeline.map((point) => ({...point,time:new Date(point.timestamp).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit'})}))} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="time" minTickGap={30} tick={{fill:'#838b80',fontSize:9}}/><YAxis allowDecimals={false} tick={{fill:'#838b80',fontSize:9}}/><Tooltip/><Line type="monotone" dataKey="detections" name="Vehicle detections" stroke="#638461" strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/></LineChart></ResponsiveContainer></div>
              : <div className="chart-empty-state history-empty"><Activity size={18}/><span>No saved vehicle detections in the last 30 days.</span></div>}
          </article>
          <article className={`panel ${!yoloObservedRows.length ? 'research-chart-placeholder-panel' : ''}`}><div className="data-panel-header"><div><span className="section-kicker">LIVE DETECTION RECORDS</span><h2>Detection confidence</h2></div><span className="chart-source-tag">{yoloObservedRows.length} saved samples</span></div>
            {yoloObservedRows.length
              ? <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={yoloObservedRows} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="time" minTickGap={30} tick={{fill:'#838b80',fontSize:9}}/><YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tickFormatter={(value)=>`${value}%`} tick={{fill:'#838b80',fontSize:9}}/><Tooltip formatter={(value, _name, item)=>[`${Number(value).toFixed(1)}%`,item.payload.vehicle]}/><Line type="monotone" dataKey="confidence" name="Confidence" stroke="#638461" strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/></LineChart></ResponsiveContainer></div>
              : <div className="chart-empty-state history-empty"><Activity size={18}/><span>Confidence graph will appear after YOLO detections are saved.</span></div>}
          </article>
          <article className={`panel ${!yoloObservedRows.length ? 'research-chart-placeholder-panel' : ''}`}><div className="data-panel-header"><div><span className="section-kicker">LIVE DETECTION RECORDS</span><h2>Inference time per detection</h2></div><span className="chart-source-tag">{yoloObservedRows.length} saved samples</span></div>
            {yoloObservedRows.length
              ? <div className="research-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={yoloObservedRows} margin={{top:12,right:12,left:-18,bottom:10}}><CartesianGrid stroke="#edf0e9" vertical={false}/><XAxis dataKey="time" minTickGap={30} tick={{fill:'#838b80',fontSize:9}}/><YAxis name="Milliseconds" unit=" ms" tick={{fill:'#838b80',fontSize:9}}/><Tooltip formatter={(value, _name, item)=>[`${Number(value).toFixed(2)} ms`,item.payload.vehicle]}/><Bar dataKey="inference_ms" name="Inference (ms)" fill="#d4876c" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>
              : <div className="chart-empty-state history-empty"><Timer size={18}/><span>Inference graph will appear after YOLO detections are saved.</span></div>}
          </article>
          <article className="panel"><div className="data-panel-header"><div><span className="section-kicker">MODEL RESULTS</span><h2>YOLO model metrics</h2></div><span className="chart-source-tag">{yoloComparison?.split || 'Not evaluated'}</span></div>
            <div className="research-yolo-table-wrap"><table className="research-yolo-table"><thead><tr><th>Model</th><th>Precision</th><th>Recall</th><th>F1</th><th>mAP@0.5</th><th>mAP@0.5:0.95</th><th>Inference</th><th>FPS</th><th>Size</th></tr></thead><tbody>
              {(yoloComparison?.comparison || []).map((model)=><tr key={model.model_name}><td>{model.model_name === 'YOLOv8n' ? 'YOLOv8n · ParkWise' : model.model_name}</td>{model.metrics ? <><td>{model.metrics.precision == null ? '—' : `${(model.metrics.precision*100).toFixed(2)}%`}</td><td>{model.metrics.recall == null ? '—' : `${(model.metrics.recall*100).toFixed(2)}%`}</td><td>{model.metrics.f1_score == null ? '—' : `${(model.metrics.f1_score*100).toFixed(2)}%`}</td><td>{model.metrics.map50 == null ? '—' : `${(model.metrics.map50*100).toFixed(2)}%`}</td><td>{model.metrics.map50_95 == null ? '—' : `${(model.metrics.map50_95*100).toFixed(2)}%`}</td><td>{model.metrics.inference_ms == null ? '—' : `${model.metrics.inference_ms} ms`}</td><td>{model.metrics.fps ?? '—'}</td><td>{model.model_size_mb == null ? '—' : `${model.model_size_mb} MB`}</td></> : <td colSpan="8">{model.status || 'Not evaluated'}</td>}</tr>)}
              {!yoloComparison?.comparison?.length && <tr><td colSpan="9">No YOLO model evaluation results.</td></tr>}
            </tbody></table></div>
            <p className="yolo-chart-note">{yoloComparison?.speed_performance_tradeoff || 'Compare models using the same labeled dataset and hardware. No values are displayed before evaluation.'} Detection accuracy is not represented as a classification accuracy score.</p>
          </article>
        </div>
      </section>
      <article className="panel evaluation-history-panel">
        <div className="data-panel-header"><div><span className="section-kicker">DATE-WISE RECORDS</span><h2>Evaluation history</h2></div><span className="chart-source-tag">{history.length} records</span></div>
        {history.length ? <div className="evaluation-history-table"><div className="history-head"><span>Date</span><span>Model</span><span>Dataset</span><span>Accuracy</span><span>Precision</span><span>Recall</span><span>F1</span></div>{history.map((row) => <div className="history-row" key={row.id}><span>{new Date(row.evaluation_date).toLocaleString()}</span><span>{row.model_name}</span><span>{row.dataset_name || 'Not provided'}</span><span>{row.classification_metrics?.accuracy == null ? '—' : `${row.classification_metrics.accuracy}%`}</span><span>{row.classification_metrics?.precision == null ? '—' : `${row.classification_metrics.precision}%`}</span><span>{row.classification_metrics?.recall == null ? '—' : `${row.classification_metrics.recall}%`}</span><span>{row.classification_metrics?.f1_score == null ? '—' : `${row.classification_metrics.f1_score}%`}</span></div>)}</div> : <div className="chart-empty-state history-empty"><Database size={18}/><span>No model evaluations recorded yet</span></div>}
      </article>
      <div className="ai-content-grid">
        <article className="panel ai-dataset-panel"><div className="data-panel-header"><div><span className="section-kicker">DATABASE INVENTORY</span><h2>Parking-space labels</h2></div><span className="chart-source-tag">{spaces.length} records</span></div>
          <p className="ai-description">Current space statuses are the labeled operational data available to this demo. This is not an image training dataset.</p>
          <div className="ai-class-list">{classCounts.map(({ label, count }) => <div className="ai-class-row" key={label}><span className={`ai-class-dot class-${label.toLowerCase()}`} /><strong>{label}</strong><span>{count}</span><i style={{ width: `${spaces.length ? count / spaces.length * 100 : 0}%` }} /></div>)}</div>
          <div className="ai-dataset-split">
            <span><small>TRAIN</small><strong>{split.train ?? 70}%</strong></span>
            <span><small>VALIDATION</small><strong>{split.validation ?? 20}%</strong></span>
            <span><small>TEST</small><strong>{split.test ?? 10}%</strong></span>
          </div>
          <div className="ai-camera-summary"><Camera size={15} /><span><strong>{status?.cameras_online ?? '—'} / {status?.cameras_total ?? '—'} cameras online</strong><small>Camera registry status from the backend.</small></span></div>
        </article>
        <article className="panel ai-model-panel"><div className="data-panel-header"><div><span className="section-kicker">MODEL REGISTRY</span><h2>Capability status</h2></div></div>
          <div className="ai-model-list">{modelStatuses.map(([name, description, modelStatus, active]) => <div className="ai-model-row" key={name}><span className="ai-model-mark">{name}</span><span><strong>{description}</strong><small>{modelStatus}</small></span><i className={!active ? 'model-status-muted' : ''} /> </div>)}</div>
          <p className="ai-demo-note"><ShieldCheck size={14} /> Occupancy classification and YOLO vehicle detection use separate datasets and metrics.</p>
        </article>
      </div>
    </section>
  )
}

function ParkingSpacesPage({ showNotice = () => {} }) {
  const [spaces, setSpaces] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  useEffect(() => {
    getParkingSpaces()
      .then((response) => {
        setSpaces(response.data)
        setDrafts(Object.fromEntries(response.data.map((space) => [space.id, { status: space.status, accessibility: space.accessibility, ev_charging: space.ev }])))
      })
      .catch((err) => setError(err.message || 'Unable to load parking spaces.'))
      .finally(() => setLoading(false))
  }, [])

  const editSpace = (spaceId, key, value) => setDrafts((current) => ({ ...current, [spaceId]: { ...current[spaceId], [key]: value } }))
  const saveSpace = async (space) => {
    setSavingId(space.id)
    setError('')
    try {
      const response = await updateParkingSpace(space.id, drafts[space.id])
      setSpaces((current) => current.map((item) => item.id === space.id ? { ...item, status: response.data.status, accessibility: response.data.accessibility, ev: response.data.ev } : item))
      showNotice(`${space.space_code} updated.`)
    } catch (err) {
      setError(err.message || 'Unable to update this space.')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <LoadingCard message="Loading parking spaces..." />
  return (
    <section className="data-page manage-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><MapPin size={12} /></span> FACILITY MANAGEMENT <span className="eyebrow-divider">/</span> SPACE INVENTORY</p><h1>Parking spaces<span className="heading-mark">.</span></h1><p className="intro-subtitle">Update bay availability and facility features.</p></div><span className="manage-total"><strong>{spaces.length}</strong> spaces</span></header>
      {error && <ErrorCard message={error} />}
      <div className="panel manage-table">
        <div className="manage-table-head"><span>SPACE</span><span>ZONE / LEVEL</span><span>STATUS</span><span>FEATURES</span><span>ACTION</span></div>
        {spaces.map((space) => <article className="manage-table-row" key={space.id}>
          <div className="manage-identity"><span className="manage-record-icon"><MapPin size={15} /></span><span><strong>{space.space_code}</strong><small>Bay ID {space.id}</small></span></div>
          <span className="manage-meta">Zone {space.zone} · {space.floor}</span>
          <select className={`space-status-select status-${String(drafts[space.id]?.status || space.status).toLowerCase()}`} value={drafts[space.id]?.status || space.status} onChange={(event) => editSpace(space.id, 'status', event.target.value)}>
            {['AVAILABLE', 'OCCUPIED', 'HELD', ...(space.status === 'RESERVED' ? ['RESERVED'] : [])].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <div className="space-feature-controls"><label><input type="checkbox" checked={drafts[space.id]?.accessibility ?? space.accessibility} onChange={(event) => editSpace(space.id, 'accessibility', event.target.checked)} /> Accessible</label><label><input type="checkbox" checked={drafts[space.id]?.ev_charging ?? space.ev} onChange={(event) => editSpace(space.id, 'ev_charging', event.target.checked)} /> EV</label></div>
          <button className="record-save-button" disabled={savingId === space.id} onClick={() => saveSpace(space)}>{savingId === space.id ? 'Saving...' : 'Save'}</button>
        </article>)}
      </div>
    </section>
  )
}

function VehiclesPage({ showNotice = () => {} }) {
  const blankVehicle = { vehicle_number: '', vehicle_type: 'CAR', owner: '', phone: '', ev: false, accessibility_requirement: false }
  const [vehicles, setVehicles] = useState([])
  const [draft, setDraft] = useState(blankVehicle)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const loadVehicles = () => getVehicles().then((response) => setVehicles(response.data))
  useEffect(() => { loadVehicles().catch((err) => setError(err.message || 'Unable to load vehicles.')).finally(() => setLoading(false)) }, [])

  const beginAdd = () => { setDraft(blankVehicle); setEditingId(null); setFormOpen(true); setError('') }
  const beginEdit = (vehicle) => {
    setDraft({ vehicle_number: vehicle.vehicle_number, vehicle_type: vehicle.vehicle_type, owner: vehicle.owner, phone: vehicle.phone || '', ev: vehicle.ev, accessibility_requirement: vehicle.accessibility_requirement })
    setEditingId(vehicle.id)
    setFormOpen(true)
    setError('')
  }
  const saveVehicle = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...draft, vehicle_number: draft.vehicle_number.trim().toUpperCase(), owner: draft.owner.trim(), phone: draft.phone.trim() || null }
    try {
      if (editingId) await updateVehicle(editingId, payload)
      else await createVehicle(payload)
      await loadVehicles()
      setFormOpen(false)
      showNotice(editingId ? 'Vehicle details updated.' : 'Vehicle registered.')
    } catch (err) {
      setError(err.message || 'Unable to save vehicle.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingCard message="Loading vehicles..." />
  return (
    <section className="data-page manage-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><CarFront size={12} /></span> FACILITY MANAGEMENT <span className="eyebrow-divider">/</span> VEHICLES</p><h1>Vehicles<span className="heading-mark">.</span></h1><p className="intro-subtitle">Manage registered vehicles and parking requirements.</p></div><button className="manage-add-button" onClick={beginAdd}><Plus size={15} /> Add vehicle</button></header>
      {error && <ErrorCard message={error} />}
      {formOpen && <form className="panel record-form" onSubmit={saveVehicle}>
        <div className="record-form-heading"><div><span className="section-kicker">{editingId ? 'EDIT RECORD' : 'NEW RECORD'}</span><h2>{editingId ? 'Update vehicle' : 'Register vehicle'}</h2></div><button type="button" className="record-cancel-button" onClick={() => setFormOpen(false)}>Close</button></div>
        <div className="record-form-fields">
          <label><span>Registration number</span><input required value={draft.vehicle_number} onChange={(event) => setDraft({ ...draft, vehicle_number: event.target.value })} placeholder="e.g. AP39AB1234" /></label>
          <label><span>Owner</span><input required value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="Owner name" /></label>
          <label><span>Vehicle type</span><select value={draft.vehicle_type} onChange={(event) => setDraft({ ...draft, vehicle_type: event.target.value })}><option>CAR</option><option>SUV</option><option>MOTORCYCLE</option><option>VAN</option></select></label>
          <label><span>Phone</span><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Optional" /></label>
        </div>
        <div className="record-form-toggles"><label><input type="checkbox" checked={draft.ev} onChange={(event) => setDraft({ ...draft, ev: event.target.checked })} /> Electric vehicle</label><label><input type="checkbox" checked={draft.accessibility_requirement} onChange={(event) => setDraft({ ...draft, accessibility_requirement: event.target.checked })} /> Requires accessible parking</label></div>
        <div className="record-form-actions"><button type="button" className="record-cancel-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="manage-add-button" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Register vehicle'}</button></div>
      </form>}
      <div className="panel manage-table">
        <div className="manage-table-head vehicle-table-head"><span>VEHICLE</span><span>OWNER</span><span>TYPE</span><span>REQUIREMENTS</span><span>ACTION</span></div>
        {vehicles.map((vehicle) => <article className="manage-table-row vehicle-table-row" key={vehicle.id}>
          <div className="manage-identity"><span className="manage-record-icon"><CarFront size={15} /></span><span><strong>{vehicle.vehicle_number}</strong><small>Registered {new Date(vehicle.registration_date).toLocaleDateString()}</small></span></div>
          <span className="manage-meta">{vehicle.owner}</span><span className="manage-meta">{vehicle.vehicle_type}</span>
          <div className="vehicle-tags">{vehicle.ev && <span>EV</span>}{vehicle.accessibility_requirement && <span>ACCESS</span>}{!vehicle.ev && !vehicle.accessibility_requirement && <small>Standard</small>}</div>
          <button className="record-edit-button" onClick={() => beginEdit(vehicle)}><Pencil size={13} /> Edit</button>
        </article>)}
      </div>
    </section>
  )
}

function ReservationsPage({ showNotice = () => {} }) {
  const [reservations, setReservations] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [availableSpaces, setAvailableSpaces] = useState([])
  const [draft, setDraft] = useState({ vehicleId: '', spaceId: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancellingId, setCancellingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const refreshData = () => Promise.all([getReservations(), getVehicles(), getParkingSpaces()]).then(([reservationResponse, vehicleResponse, spaceResponse]) => {
    const available = spaceResponse.data.filter((space) => space.status === 'AVAILABLE')
    setReservations(reservationResponse.data)
    setVehicles(vehicleResponse.data)
    setAvailableSpaces(available)
    setDraft((current) => ({
      vehicleId: current.vehicleId || String(vehicleResponse.data[0]?.id || ''),
      spaceId: available.some((space) => String(space.id) === current.spaceId) ? current.spaceId : String(available[0]?.id || ''),
    }))
  })
  useEffect(() => {
    refreshData()
      .catch((err) => setError(err.message || 'Unable to load reservations.'))
      .finally(() => setLoading(false))
  }, [])

  const createBooking = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createReservation({ vehicle_id: Number(draft.vehicleId), parking_space_id: Number(draft.spaceId) })
      await refreshData()
      setFormOpen(false)
      showNotice('Reservation created.')
    } catch (err) {
      setError(err.message || 'Unable to create reservation.')
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (reservation) => {
    setCancellingId(reservation.id)
    try {
      await cancelReservation(reservation.id)
      await refreshData()
      showNotice(`Reservation for ${reservation.space_code} cancelled.`)
    } catch (err) {
      setError(err.message || 'Unable to cancel reservation.')
    } finally {
      setCancellingId(null)
    }
  }

  const dateText = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'No end time set'

  if (loading) return <LoadingCard message="Loading reservations..." />
  return (
    <section className="data-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><ShieldCheck size={12} /></span> PARKING OPERATIONS <span className="eyebrow-divider">/</span> RESERVATIONS</p><h1>Reservations<span className="heading-mark">.</span></h1><p className="intro-subtitle">Review active bookings and their assigned spaces.</p></div><div className="reservation-page-actions"><span className="reservation-count"><strong>{reservations.length}</strong> active</span><button className="manage-add-button" onClick={() => { setFormOpen((open) => !open); setError('') }} disabled={!availableSpaces.length || !vehicles.length}><Plus size={15} /> New reservation</button></div></header>
      {error && <ErrorCard message={error} />}
      {formOpen && <form className="panel record-form" onSubmit={createBooking}>
        <div className="record-form-heading"><div><span className="section-kicker">NEW BOOKING</span><h2>Assign a vehicle and available space</h2></div><button type="button" className="record-cancel-button" onClick={() => setFormOpen(false)}>Close</button></div>
        <div className="reservation-form-fields"><label><span>Vehicle</span><select required value={draft.vehicleId} onChange={(event) => setDraft((current) => ({ ...current, vehicleId: event.target.value }))}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number} · {vehicle.owner}</option>)}</select></label><label><span>Available space</span><select required value={draft.spaceId} onChange={(event) => setDraft((current) => ({ ...current, spaceId: event.target.value }))}>{availableSpaces.map((space) => <option key={space.id} value={space.id}>{space.space_code} · Zone {space.zone} · {space.floor}</option>)}</select></label></div>
        <div className="record-form-actions"><button type="button" className="record-cancel-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="manage-add-button" disabled={saving || !draft.vehicleId || !draft.spaceId}>{saving ? 'Creating...' : 'Create reservation'}</button></div>
      </form>}
      {reservations.length ? <div className="reservation-list">
        {reservations.map((item) => <article className="panel reservation-row" key={item.id}>
          <span className="reservation-space-mark"><MapPin size={17} /></span>
          <div className="reservation-main"><span className="reservation-code">{item.space_code || `Space ${item.parking_space_id}`} <small>· {item.floor || 'Level 01'} · Zone {item.zone || '—'}</small></span><span className="reservation-vehicle"><CarFront size={14} /> {item.vehicle_number || `Vehicle ${item.vehicle_id}`} <span>·</span> {item.owner || item.vehicle_type || 'Registered vehicle'}</span></div>
          <div className="reservation-time"><small>START TIME</small><strong>{dateText(item.start_time)}</strong></div>
          <span className={`reservation-status status-${String(item.status).toLowerCase()}`}>{item.status}</span>
          <button className="reservation-cancel" disabled={cancellingId === item.id} onClick={() => cancel(item)}>{cancellingId === item.id ? 'Cancelling...' : 'Cancel'}</button>
        </article>)}
      </div> : <div className="panel reservation-empty"><span><ShieldCheck size={22} /></span><h2>No active reservations</h2><p>When a space is reserved, its vehicle and arrival details will appear here.</p></div>}
    </section>
  )
}

function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    getPayments()
      .then((response) => setPayments(response.data))
      .catch((requestError) => setError(requestError.message || 'Unable to load payment records.'))
  }, [])
  return (
    <section className="panel" style={{ padding: 18 }}>
      <h2>Payments</h2>
      {error && <ErrorCard message={error} />}
      <div style={{ display: 'grid', gap: 8 }}>
        {payments.map((payment) => <div key={payment.id} className="dataset-card" style={{ margin: 0 }}><span className="dataset-mark"><BadgeCheck size={16} /></span><span className="dataset-details"><strong>{payment.payment_method}</strong><small>{payment.status}</small></span><span className="image-count">₹{Number(payment.amount || 0).toLocaleString('en-IN')}<br />{payment.id}</span></div>)}
      </div>
    </section>
  )
}

function AnalyticsPage() {
  const [summary, setSummary] = useState(null)
  const [occupancyData, setOccupancyData] = useState([])
  const [revenueData, setRevenueData] = useState([])
  const [demandData, setDemandData] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([getDashboardSummary(), getAnalyticsOccupancy(), getAnalyticsRevenue(), getAnalyticsDemand()])
      .then(([summaryResponse, occupancyResponse, revenueResponse, demandResponse]) => {
        setSummary(summaryResponse.data)
        setOccupancyData(occupancyResponse.data)
        setRevenueData(revenueResponse.data)
        setDemandData(demandResponse.data)
      })
      .catch((err) => setError(err.message || 'Unable to load analytics data.'))
  }, [])
  const mix = [
    { name: 'Available', value: summary?.available_spaces ?? 0, color: '#75956d' },
    { name: 'Occupied', value: summary?.occupied_spaces ?? 0, color: '#d4876c' },
    { name: 'Reserved', value: summary?.reserved_spaces ?? 0, color: '#d4b56b' },
    { name: 'Held', value: summary?.held_spaces ?? 0, color: '#9ca79b' },
  ]
  const totalRevenue = revenueData.reduce((total, point) => total + Number(point.revenue || 0), 0)

  return (
    <section className="data-page analytics-page">
      <header className="page-intro"><div><p className="eyebrow"><span className="eyebrow-square"><BarChart3 size={12} /></span> PARKING OPERATIONS <span className="eyebrow-divider">/</span> ANALYTICS</p><h1>Facility analytics<span className="heading-mark">.</span></h1><p className="intro-subtitle">Current operating snapshot and seeded trend samples.</p></div><span className="forecast-demo-tag"><i /> DEMO ANALYTICS</span></header>
      {error && <ErrorCard message={error} />}
      <div className="analytics-kpis">
        <article><span className="analytics-kpi-icon kpi-green"><MapPin size={15} /></span><small>OCCUPANCY RATE</small><strong>{summary?.occupancy_rate ?? '—'}%</strong><span>{summary?.occupied_spaces ?? '—'} occupied of {summary?.total_spaces ?? '—'} spaces</span></article>
        <article><span className="analytics-kpi-icon kpi-orange"><CarFront size={15} /></span><small>VEHICLES TODAY</small><strong>{summary?.vehicles_today ?? '—'}</strong><span>Recorded parking sessions</span></article>
        <article><span className="analytics-kpi-icon kpi-blue"><Database size={15} /></span><small>REVENUE TODAY</small><strong>₹{Number(summary?.revenue_today ?? 0).toLocaleString('en-IN')}</strong><span>Completed payment records</span></article>
        <article><span className="analytics-kpi-icon kpi-gold"><Activity size={15} /></span><small>WEEKLY SAMPLE REVENUE</small><strong>₹{totalRevenue.toLocaleString('en-IN')}</strong><span>Trend sample supplied by API</span></article>
        <article><span className="analytics-kpi-icon kpi-green"><LocateFixed size={15}/></span><small>TOTAL SPACES</small><strong>{summary?.total_spaces ?? '—'}</strong><span>{summary?.available_spaces ?? '—'} currently available</span></article>
        <article><span className="analytics-kpi-icon kpi-orange"><ShieldCheck size={15}/></span><small>RESERVED SPACES</small><strong>{summary?.reserved_spaces ?? '—'}</strong><span>Current reservation status</span></article>
        <article><span className="analytics-kpi-icon kpi-blue"><Camera size={15}/></span><small>VEHICLES DETECTED</small><strong>{summary?.vehicles_detected ?? '—'}</strong><span>Stored detection records</span></article>
        <article><span className="analytics-kpi-icon kpi-gold"><Clock3 size={15}/></span><small>AVERAGE PARKING TIME</small><strong>{summary?.average_parking_minutes == null ? 'Not Evaluated Yet' : `${summary.average_parking_minutes} min`}</strong><span>Actual completed sessions</span></article>
        <article><span className="analytics-kpi-icon kpi-green"><BadgeCheck size={15}/></span><small>SUCCESSFUL ALLOCATIONS</small><strong>{summary?.successful_allocations ?? '—'}</strong><span>Recorded reservations</span></article>
        <article><span className="analytics-kpi-icon kpi-orange"><Shield size={15}/></span><small>FAILED ALLOCATIONS</small><strong>{summary?.failed_allocations ?? 'Not Tracked Yet'}</strong><span>No event counter is currently recorded</span></article>
      </div>
      <div className="analytics-grid">
        <article className="panel analytics-chart-panel">
          <div className="data-panel-header"><div><span className="section-kicker">SPACE UTILIZATION</span><h2>Occupancy by hour</h2></div><span className="chart-source-tag">Hourly sample</span></div>
          <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={occupancyData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip /><Line type="monotone" dataKey="occupied" name="Occupied bays" stroke="#638461" strokeWidth={2.5} dot={{ r: 3, fill: '#638461', strokeWidth: 0 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>
        </article>
        <article className="panel analytics-chart-panel">
          <div className="data-panel-header"><div><span className="section-kicker">PAYMENT TREND</span><h2>Revenue by day</h2></div><span className="chart-source-tag">API sample</span></div>
          <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenueData} margin={{ top: 10, right: 12, left: -7, bottom: 0 }}><defs><linearGradient id="analyticsRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d3a557" stopOpacity={0.22}/><stop offset="95%" stopColor="#d3a557" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue']} /><Area type="monotone" dataKey="revenue" stroke="#c28d48" strokeWidth={2.5} fill="url(#analyticsRevenue)" activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer></div>
        </article>
        <article className="panel analytics-chart-panel">
          <div className="data-panel-header"><div><span className="section-kicker">CAPACITY OUTLOOK</span><h2>Forecast through the day</h2></div><span className="chart-source-tag">16 intervals</span></div>
          <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={demandData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}><defs><linearGradient id="analyticsDemand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#719bb0" stopOpacity={0.22}/><stop offset="95%" stopColor="#719bb0" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="hour" interval={2} tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: '#838b80', fontSize: 9 }} /><Tooltip formatter={(value) => [`${value}%`, 'Forecast occupancy']} /><Area type="monotone" dataKey="occupancy_percent" stroke="#648da2" strokeWidth={2} fill="url(#analyticsDemand)" activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer></div>
        </article>
        <article className="panel analytics-chart-panel mix-panel">
          <div className="data-panel-header"><div><span className="section-kicker">SPACE STATUS</span><h2>Capacity breakdown</h2></div><span className="chart-source-tag">Live database</span></div>
          <div className="capacity-breakdown"><div className="capacity-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={mix} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="86%" paddingAngle={2} stroke="none">{mix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><span><strong>{summary?.total_spaces ?? '—'}</strong><small>spaces</small></span></div><div className="capacity-legend">{mix.map((entry) => <div key={entry.name}><i style={{ background: entry.color }} /><span>{entry.name}</span><strong>{entry.value}</strong></div>)}</div></div>
        </article>
      </div>
    </section>
  )
}

function SettingsPage({ onNameChange, showNotice = () => {} }) {
  const navigate = useNavigate()
  const [section, setSection] = useState('profile')
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState(() => {
    const defaults = {
      displayName: localStorage.getItem('parkwise-display-name') || 'krishna',
      email: 'admin@parkwise.local',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      defaultZone: 'Any zone',
      reservationWindow: 30,
      notifications: { occupancy: true, reservations: true, system: false },
    }
    try {
      const stored = JSON.parse(localStorage.getItem('parkwise-preferences') || '{}')
      return { ...defaults, ...stored, notifications: { ...defaults.notifications, ...stored.notifications } }
    } catch {
      return defaults
    }
  })
  const sections = [
    { id: 'profile', label: 'Profile', description: 'Your account details', icon: UserRound },
    { id: 'operations', label: 'Operations', description: 'Parking preferences', icon: Settings2 },
    { id: 'notifications', label: 'Notifications', description: 'Alerts and updates', icon: Bell },
    { id: 'security', label: 'Security', description: 'Session and access', icon: LockKeyhole },
  ]
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
  const updateNotification = (key, value) => setSettings((current) => ({
    ...current,
    notifications: { ...current.notifications, [key]: value },
  }))
  const saveSettings = () => {
    const name = settings.displayName.trim() || 'krishna'
    const next = { ...settings, displayName: name }
    localStorage.setItem('parkwise-preferences', JSON.stringify(next))
    localStorage.setItem('parkwise-display-name', name)
    setSettings(next)
    onNameChange(name)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
    showNotice('Workspace preferences saved on this device.')
  }
  const signOut = () => {
    localStorage.removeItem('parkwise-token')
    navigate('/login')
  }

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <p className="eyebrow"><span className="eyebrow-square"><Settings2 size={12} /></span> ADMINISTRATION <span className="eyebrow-divider">/</span> PREFERENCES</p>
          <h1>Settings<span className="heading-mark">.</span></h1>
          <p>Manage your account and parking workspace.</p>
        </div>
        <div className="settings-save-group">
          <span className="settings-save-note">{saved ? 'Changes saved' : 'Preferences are stored on this device'}</span>
          <button className="settings-save-button" onClick={saveSettings}><Save size={15} /> Save changes</button>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map(({ id, label, description, icon: Icon }) => (
            <button key={id} className={`settings-nav-item ${section === id ? 'is-active' : ''}`} onClick={() => setSection(id)}>
              <span className="settings-nav-icon"><Icon size={16} /></span>
              <span className="settings-nav-copy"><strong>{label}</strong><small>{description}</small></span>
              <ChevronRight size={14} />
            </button>
          ))}
          <div className="settings-workspace-note"><Building2 size={15} /><span><small>ACTIVE WORKSPACE</small><strong>Northgate Centre</strong></span></div>
        </nav>

        <div className="settings-content">
          {section === 'profile' && (
            <section className="settings-pane">
              <div className="settings-pane-heading"><span className="settings-pane-icon"><UserRound size={17} /></span><div><h2>Your profile</h2><p>Update the identity used around this workspace.</p></div></div>
              <div className="settings-profile-summary"><span className="settings-profile-avatar">{settings.displayName.trim().slice(0, 1).toUpperCase() || 'K'}</span><span><strong>{settings.displayName || 'krishna'}</strong><small>Parking administrator</small></span><span className="settings-role-badge">ADMIN</span></div>
              <div className="settings-fields">
                <label className="settings-field"><span>Display name</span><input value={settings.displayName} onChange={(event) => update('displayName', event.target.value)} autoComplete="name" /></label>
                <label className="settings-field"><span>Email address</span><input value={settings.email} readOnly /><small>Managed by your sign-in account</small></label>
              </div>
            </section>
          )}

          {section === 'operations' && (
            <section className="settings-pane">
              <div className="settings-pane-heading"><span className="settings-pane-icon"><Settings2 size={17} /></span><div><h2>Parking operations</h2><p>Set the defaults used while finding and reserving spaces.</p></div></div>
              <div className="settings-workspace-row"><span className="settings-row-icon"><Building2 size={16} /></span><span><strong>Northgate Centre</strong><small>Car park · Level 01</small></span><span className="settings-connected"><i /> Connected</span></div>
              <div className="settings-fields">
                <label className="settings-field"><span>Default zone</span><select value={settings.defaultZone} onChange={(event) => update('defaultZone', event.target.value)}><option>Any zone</option><option>Zone A</option><option>Zone B</option><option>Zone C</option><option>Zone D</option><option>Zone E</option></select></label>
                <label className="settings-field"><span>Reservation hold</span><span className="settings-input-suffix"><input type="number" min="5" max="120" step="5" value={settings.reservationWindow} onChange={(event) => update('reservationWindow', Number(event.target.value))} /><small>minutes</small></span></label>
                <label className="settings-field"><span>Display currency</span><select value={settings.currency} onChange={(event) => update('currency', event.target.value)}><option value="INR">INR · Indian rupee</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option></select></label>
                <label className="settings-field"><span>Time zone</span><select value={settings.timezone} onChange={(event) => update('timezone', event.target.value)}><option value="Asia/Kolkata">Asia/Kolkata · UTC+05:30</option><option value="UTC">UTC · UTC+00:00</option><option value="Europe/London">Europe/London</option></select></label>
              </div>
            </section>
          )}

          {section === 'notifications' && (
            <section className="settings-pane">
              <div className="settings-pane-heading"><span className="settings-pane-icon"><Bell size={17} /></span><div><h2>Notifications</h2><p>Choose which operational updates you want to see.</p></div></div>
              <SettingsToggle title="Occupancy changes" description="When availability changes in your parking facility." checked={settings.notifications.occupancy} onChange={(value) => updateNotification('occupancy', value)} />
              <SettingsToggle title="Reservation activity" description="New reservations, cancellations, and upcoming arrivals." checked={settings.notifications.reservations} onChange={(value) => updateNotification('reservations', value)} />
              <SettingsToggle title="System health alerts" description="Camera, database, and service status changes." checked={settings.notifications.system} onChange={(value) => updateNotification('system', value)} />
              <p className="settings-local-note">These notification preferences are saved in this browser. Email delivery is not configured.</p>
            </section>
          )}

          {section === 'security' && (
            <section className="settings-pane">
              <div className="settings-pane-heading"><span className="settings-pane-icon"><LockKeyhole size={17} /></span><div><h2>Security & access</h2><p>Review your current session and sign out when you’re done.</p></div></div>
              <div className="settings-session-row"><span className="settings-session-icon"><ShieldCheck size={17} /></span><span><strong>Administrator session</strong><small>{settings.email} · This browser</small></span><span className="settings-session-status"><i /> ACTIVE</span></div>
              <div className="settings-security-note"><LockKeyhole size={15} /><span><strong>Protected connection</strong><small>API requests are sent to {import.meta.env.VITE_API_URL || '/api'}.</small></span></div>
              <button className="settings-signout-button" onClick={signOut}><LogOut size={15} /> Sign out</button>
            </section>
          )}
          <div className="settings-footer"><span><ShieldCheck size={14} /> Parkwise workspace preferences</span><span>Changes apply after saving</span></div>
        </div>
      </div>
    </section>
  )
}

function SettingsToggle({ title, description, checked, onChange }) {
  return (
    <label className="settings-toggle-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <span className="settings-switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></span>
    </label>
  )
}

function LoginPage() {
  const [form, setForm] = useState({ email: 'admin@parkwise.local', password: 'password123' })
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  const onSubmit = async (event) => {
    event.preventDefault()
    try {
      const response = await api.post('/auth/login', form)
      localStorage.setItem('parkwise-token', response.data.token)
      navigate('/dashboard')
    } catch (error) {
      setMessage(error.message || 'Login failed')
    }
  }

  return (
    <div style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', background: '#f5f5ef' }}>
      <form onSubmit={onSubmit} className="panel" style={{ width: 360, padding: 25 }}>
        <h2>Parkwise login</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" style={{ padding: 10, borderRadius: 6, border: '1px solid #e2e4dd' }} />
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" style={{ padding: 10, borderRadius: 6, border: '1px solid #e2e4dd' }} />
          <button type="submit" className="reserve-button">Login</button>
          {message && <p style={{ color: '#b35a4d' }}>{message}</p>}
        </div>
      </form>
    </div>
  )
}

function MetricCard({ icon, label, value, unit = '', total = '', note, tone, width, custom }) {
  return (
    <article className={`metric metric-${tone}`}>
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <div className="metric-value-row">
        <strong>{value}<span className="metric-hour">{unit}</span></strong>
        {total && <span className="metric-total">{total}</span>}
      </div>
      <span className="metric-note">{note}</span>
      <span className="metric-rail"><i style={{ width: `${width}%` }} /></span>
      {custom}
    </article>
  )
}

function LoadingCard({ message = 'Loading...' }) {
  return <section className="panel" style={{ padding: 20 }}><p>{message}</p></section>
}

function ErrorCard({ message }) {
  return <section className="panel" style={{ padding: 20 }}><p style={{ color: '#b35a4d' }}>{message}</p></section>
}

function ParkingSpace({ space, selected, onSelect }) {
  const normalized = (space.status || 'AVAILABLE').toUpperCase()
  const isSelected = selected
  const label = `${space.space_code}, ${normalized}${space.accessibility ? ', accessible' : ''}`
  return <button className={`parking-space space-${normalized.toLowerCase()} ${isSelected ? 'space-selected' : ''}`} onClick={onSelect} aria-label={label} aria-pressed={isSelected} title={label}><span className="space-top-line"><span>{space.space_code}</span>{space.accessibility && <span className="space-accessible-mark">♿</span>}</span><span className="space-vehicle">{normalized === 'OCCUPIED' ? <CarFront size={18} strokeWidth={1.7} /> : normalized === 'RESERVED' ? <ShieldCheck size={17} strokeWidth={1.7} /> : <span className="free-space-dot" />}</span><span className="space-bottom-line">{normalized === 'AVAILABLE' ? 'OPEN' : normalized === 'OCCUPIED' ? 'IN USE' : 'HELD'}</span></button>
}

export default App
