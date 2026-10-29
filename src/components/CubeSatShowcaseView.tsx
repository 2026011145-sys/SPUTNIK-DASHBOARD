import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { 
  Satellite, 
  Layers, 
  Radio, 
  Cpu, 
  Zap, 
  ShieldCheck, 
  Maximize2, 
  Minimize2, 
  ExternalLink, 
  ChevronRight, 
  Mail, 
  Activity, 
  Compass, 
  Sliders, 
  Eye, 
  Sparkles,
  X,
  Send
} from 'lucide-react';
import { TelemetryPacket } from '../types/telemetry';

interface CubeSatShowcaseViewProps {
  currentPacket?: TelemetryPacket | null;
  onGoToCommandCenter: () => void;
  onOpenTeamModal: () => void;
}

export const CubeSatShowcaseView: React.FC<CubeSatShowcaseViewProps> = ({
  currentPacket,
  onGoToCommandCenter,
  onOpenTeamModal,
}) => {
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'features'>('description');
  const [viewMode, setViewMode] = useState<'cinematic' | 'interactive3d'>('cinematic');
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMsg, setContactMsg] = useState('');

  // 3D Three.js canvas ref for Interactive 3D mode
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const satMeshRef = useRef<THREE.Group | null>(null);

  // Initialize Three.js interactive 3D CubeSat model when in interactive mode
  useEffect(() => {
    if (viewMode !== 'interactive3d' || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.8, 1.8, 3.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Deep space lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
    sunLight.position.set(6, 8, 6);
    scene.add(sunLight);

    const earthReflection = new THREE.DirectionalLight(0x38bdf8, 1.2);
    earthReflection.position.set(-6, -4, -6);
    scene.add(earthReflection);

    // Starfield particles
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const starCoords = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starCoords[i] = (Math.random() - 0.5) * 40;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      transparent: true,
      opacity: 0.8,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // CubeSat 1U Satellite Model
    const satGroup = new THREE.Group();
    satMeshRef.current = satGroup;
    scene.add(satGroup);

    // Main 1U chassis (100x100x113.5 mm)
    const chassisGeo = new THREE.BoxGeometry(1.2, 1.35, 1.2);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    satGroup.add(chassis);

    // Outer skeletal rail frame (anodized aerospace aluminum)
    const edgeGeo = new THREE.EdgesGeometry(chassisGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    satGroup.add(edgeLines);

    // Optical Camera / Payload Lens Assembly
    const lensRingGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.2, 32);
    const lensRingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
    const lensRing = new THREE.Mesh(lensRingGeo, lensRingMat);
    lensRing.rotation.x = Math.PI / 2;
    lensRing.position.z = 0.65;
    satGroup.add(lensRing);

    const glassGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.21, 32);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.85,
      ior: 1.5,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.rotation.x = Math.PI / 2;
    glass.position.z = 0.66;
    satGroup.add(glass);

    // Left Solar Panel Wing
    const wingGeo = new THREE.BoxGeometry(1.8, 0.04, 1.1);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      metalness: 0.6,
      roughness: 0.3,
    });
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(-1.55, 0, 0);
    satGroup.add(leftWing);

    // Right Solar Panel Wing
    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.set(1.55, 0, 0);
    satGroup.add(rightWing);

    // Wire Antennas (4 Monopole Radiators)
    const antMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.1 });
    const antGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.6, 8);

    const ant1 = new THREE.Mesh(antGeo, antMat);
    ant1.position.set(-0.6, 0.6, 0.6);
    ant1.rotation.set(-0.4, 0, 0.4);
    satGroup.add(ant1);

    const ant2 = new THREE.Mesh(antGeo, antMat);
    ant2.position.set(0.6, 0.6, 0.6);
    ant2.rotation.set(-0.4, 0, -0.4);
    satGroup.add(ant2);

    const ant3 = new THREE.Mesh(antGeo, antMat);
    ant3.position.set(-0.6, -0.6, 0.6);
    ant3.rotation.set(0.4, 0, 0.4);
    satGroup.add(ant3);

    const ant4 = new THREE.Mesh(antGeo, antMat);
    ant4.position.set(0.6, -0.6, 0.6);
    ant4.rotation.set(0.4, 0, -0.4);
    satGroup.add(ant4);

    // Animation loop
    let reqId: number;
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !satMeshRef.current) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      satMeshRef.current.rotation.y += deltaX * 0.01;
      satMeshRef.current.rotation.x += deltaY * 0.01;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };
    const onMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      if (satMeshRef.current) {
        if (!isDragging) {
          satMeshRef.current.rotation.y += 0.005;
          satMeshRef.current.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [viewMode]);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSent(true);
    setTimeout(() => {
      setIsContactOpen(false);
      setContactSent(false);
      setContactName('');
      setContactEmail('');
      setContactMsg('');
    }, 2000);
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-[#020408] border border-slate-800 shadow-2xl min-h-[640px] text-slate-100 flex flex-col font-sans select-none">
      {/* 1. Aerospace Top Navigation Bar (Matching uploaded design layout) */}
      <div className="w-full z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* Left: Brand & Product Identifier */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-mono font-bold tracking-tighter text-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-cyan-400 inline-block shadow-sm shadow-cyan-400/80 animate-pulse" />
              : HERCULES
            </span>
            <span className="text-slate-600 font-mono text-xs">/</span>
            <span className="text-slate-400 font-mono text-xs hidden sm:inline">
              SPUTNIK · ORBITRA '26
            </span>
          </div>
        </div>

        {/* Center / Right: Clean Navigation Links & Primary Action */}
        <div className="flex items-center gap-4 sm:gap-6 text-xs font-mono">
          <div className="hidden md:flex items-center gap-6 text-slate-400">
            <button 
              onClick={() => setActiveTab('specs')}
              className="hover:text-slate-200 transition-colors cursor-pointer"
            >
              Products
            </button>
            <button 
              onClick={() => setActiveTab('description')}
              className="hover:text-slate-200 transition-colors cursor-pointer"
            >
              Mission services
            </button>
            <button 
              onClick={onGoToCommandCenter}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
            >
              <span>Command Center</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Contact Us button matching screenshot */}
          <button
            onClick={() => setIsContactOpen(true)}
            className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-all shadow-md shadow-blue-900/40 cursor-pointer"
          >
            Contact Us
          </button>
        </div>
      </div>

      {/* Breadcrumb strip (Home / Products / CubeSat N1U) */}
      <div className="w-full px-6 z-20 text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
        <span>Home</span>
        <span>/</span>
        <span>Products</span>
        <span>/</span>
        <span className="text-slate-300">CubeSat N1U</span>
      </div>

      {/* 2. Visual Centerpiece: Deep Space Viewport */}
      <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden min-h-[460px] md:min-h-[520px]">
        {/* Render mode 1: Cinematic Ultra-HD Render */}
        {viewMode === 'cinematic' ? (
          <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-6">
            <img
              src="/src/assets/images/cubesat_n1u_hero_1793231345627.jpg"
              alt="CubeSat N1U 1U Satellite with Deployed Solar Panels"
              className="max-h-[460px] md:max-h-[520px] w-auto object-contain drop-shadow-[0_20px_50px_rgba(2,132,199,0.25)] transition-transform duration-700 hover:scale-[1.02]"
            />

            {/* Subtle space glow effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-blue-500/10 blur-[100px] pointer-events-none rounded-full" />
          </div>
        ) : (
          /* Render mode 2: Interactive 3D Three.js WebGL Model */
          <div className="relative w-full h-full min-h-[460px] flex items-center justify-center">
            <div ref={mountRef} className="w-full h-full min-h-[460px] cursor-grab active:cursor-grabbing" />
            <div className="absolute top-3 right-6 text-[10px] font-mono text-slate-400 bg-slate-900/70 border border-slate-800 px-2 py-1 rounded backdrop-blur-xs">
              Drag to rotate 3D satellite · Auto-spin active
            </div>
          </div>
        )}

        {/* View Mode Switcher (Cinematic vs Interactive 3D) */}
        <div className="absolute top-3 left-6 z-20 flex items-center gap-1 bg-slate-950/80 border border-slate-800/90 rounded-lg p-1 backdrop-blur-md">
          <button
            onClick={() => setViewMode('cinematic')}
            className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
              viewMode === 'cinematic'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cinematic Render
          </button>
          <button
            onClick={() => setViewMode('interactive3d')}
            className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
              viewMode === 'interactive3d'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Interactive 3D
          </button>
        </div>

        {/* 3. Hero Card: Bottom-Left (CubeSat N1U Title & Copy from screenshot) */}
        <div className="absolute bottom-16 sm:bottom-14 left-6 z-20 max-w-sm sm:max-w-md bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/5 space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
            CubeSat N1U
          </h1>
          <p className="text-xs text-slate-300/90 leading-relaxed font-sans">
            Partnering with industry giants like NASA, SpaceX, ISRO, and Boeing, we ensure precision, innovation, and excellence in every space deployment.
          </p>

          <div className="pt-1 flex items-center gap-4">
            <button
              onClick={() => setIsContactOpen(true)}
              className="text-xs font-medium text-white hover:text-blue-400 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Get in Touch</span>
              <span className="text-sm">→</span>
            </button>

            <button
              onClick={onGoToCommandCenter}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Telemetry Downlink</span>
            </button>
          </div>
        </div>

        {/* Live ESP32 Hardware Status Badge (Top-Right) */}
        {currentPacket && (
          <div className="hidden sm:flex absolute bottom-16 right-6 z-20 bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-xl p-3 text-xs font-mono space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ESP32 TELEMETRY ONLINE</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Alt: <strong className="text-slate-200">{currentPacket.altitude.toFixed(1)} m</strong> · 
              Press: <strong className="text-slate-200">{currentPacket.pressure.toFixed(1)} hPa</strong>
            </div>
            <div className="text-[10px] text-slate-400">
              Temp: <strong className="text-slate-200">{currentPacket.tempAmbient.toFixed(1)} °C</strong> · 
              Batt: <strong className="text-slate-200">{currentPacket.voltage.toFixed(2)} V</strong>
            </div>
          </div>
        )}
      </div>

      {/* 4. Bottom Tab Navigation (Description · Technical Specs · Features) */}
      <div className="w-full z-20 border-t border-slate-800/80 bg-black/80 backdrop-blur-md px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab('description')}
            className={`pb-1 text-xs font-sans transition-all relative cursor-pointer ${
              activeTab === 'description'
                ? 'text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Description</span>
            {activeTab === 'description' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('specs')}
            className={`pb-1 text-xs font-sans transition-all relative cursor-pointer ${
              activeTab === 'specs'
                ? 'text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Technical Specs</span>
            {activeTab === 'specs' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('features')}
            className={`pb-1 text-xs font-sans transition-all relative cursor-pointer ${
              activeTab === 'features'
                ? 'text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Features</span>
            {activeTab === 'features' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-500 hidden sm:block">
          ORBITRA '26 · TEAM SPUTNIK MMMUT
        </div>
      </div>

      {/* 5. Detailed Drawer for Active Bottom Tab */}
      <div className="w-full z-20 bg-slate-950/95 border-t border-slate-800/80 p-5 font-mono text-xs">
        {activeTab === 'description' && (
          <div className="max-w-4xl space-y-2">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              CubeSat N1U - Mission Scope & Flight Architecture
            </h3>
            <p className="text-slate-300 leading-relaxed font-sans text-xs">
              The CubeSat N1U (Team Sputnik, MMMUT Gorakhpur) is a standardized 1U aerospace nanosatellite platform engineered for the ORBITRA ’26 national space telemetry competition. Equipped with deployable photovoltaic wings, dual-deploy recovery parachutes, and a multi-sensor avionics bay, the spacecraft autonomously logs barometric pressure, multi-axis attitude dynamics, and environmental readings during ascent, apogee, and descent.
            </p>
            <div className="flex flex-wrap gap-4 pt-2 text-[11px] text-slate-400">
              <div><strong className="text-cyan-400">Payload:</strong> Atmospheric Sensing + Live Camera</div>
              <div><strong className="text-cyan-400">Transceiver:</strong> 433 MHz LoRa + High-Speed USB Serial</div>
              <div><strong className="text-cyan-400">Recovery:</strong> Servo-actuated Drogue & Main Parachute</div>
            </div>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="max-w-5xl">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide mb-3">
              CubeSat N1U Aerospace Technical Specifications
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">FORM FACTOR</span>
                <span className="text-slate-200 font-bold text-xs mt-0.5 block">1U (100 × 100 × 113.5 mm)</span>
                <span className="text-slate-400 text-[10px]">Mass: 1.28 kg nominal</span>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">MAIN ONBOARD COMPUTER</span>
                <span className="text-cyan-300 font-bold text-xs mt-0.5 block">ESP32 Dual-Core @ 240 MHz</span>
                <span className="text-slate-400 text-[10px]">FreeRTOS Multi-threaded</span>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">SOLAR POWER SYSTEM (EPS)</span>
                <span className="text-amber-300 font-bold text-xs mt-0.5 block">GaAs Triple-Junction 29.5%</span>
                <span className="text-slate-400 text-[10px]">7.4V LiPo 2S 2200 mAh</span>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">RF DOWNLINK & UPLINK</span>
                <span className="text-emerald-300 font-bold text-xs mt-0.5 block">SX1278 LoRa @ 433 MHz</span>
                <span className="text-slate-400 text-[10px]">USB UART @ 115200 Baud</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="max-w-5xl space-y-2">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide mb-2">
              Key Engineering Features & Flight Capabilities
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold mb-1">
                  <Zap className="w-4 h-4" />
                  <span>Deployable Solar Array</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed font-sans">
                  Dual spring-loaded solar wings provide continuous power generation, extending mission duration and charging the onboard secondary battery pack.
                </p>
              </div>

              <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Autonomous Parachute Ejection</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed font-sans">
                  Barometric pressure thresholds and downward acceleration trigger servo ejection at apogee, ensuring safe terminal velocity descent below 6 m/s.
                </p>
              </div>

              <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-blue-400 font-semibold mb-1">
                  <Radio className="w-4 h-4" />
                  <span>Real-Time Web Serial Downlink</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed font-sans">
                  Direct USB hardware bridge to Chrome/Edge enables 100% zero-latency ground station telemetry logging and instant Supabase cloud synchronization.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Contact Us Modal Dialog */}
      {isContactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                <h3 className="font-mono font-bold text-slate-100 text-sm uppercase">
                  Contact Team Sputnik / Hercules
                </h3>
              </div>
              <button
                onClick={() => setIsContactOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {contactSent ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-600 text-emerald-400 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-mono font-bold text-slate-100">Message Dispatched!</h4>
                <p className="text-xs text-slate-400 font-sans">
                  Thank you for your interest in CubeSat N1U. Team Sputnik, MMMUT will respond shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="mt-4 space-y-3 font-mono text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">NAME / ORGANIZATION</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. ORBITRA '26 Evaluator"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">EMAIL ADDRESS</label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="evaluator@orbitra.space"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">INQUIRY / MISSION BRIEF</label>
                  <textarea
                    rows={3}
                    required
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    placeholder="Inquire regarding CubeSat N1U specs, flight tests, or telemetry integration..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsContactOpen(false)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-900/30"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Inquiry</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
