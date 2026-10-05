import { useEffect, useRef, useState } from 'react';
import { ReelOrbEngine } from './orbEngine';
import { GestureController } from './gestureController';

export default function App() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const orbRef = useRef(null);
  const trackerRef = useRef(null);
  const [orange, setOrange] = useState(false);
  const [camera, setCamera] = useState('OFF');
  const [hands, setHands] = useState(0);

  useEffect(() => {
    const orb = new ReelOrbEngine(canvasRef.current);
    orb.start();
    orbRef.current = orb;
    return () => {
      trackerRef.current?.stop();
      orb.dispose();
    };
  }, []);

  useEffect(() => {
    orbRef.current?.setMode(orange ? 'orange' : 'blue');
  }, [orange]);

  useEffect(() => {
    const start = async () => {
      if (!videoRef.current || trackerRef.current) return;
      const tracker = new GestureController(
        videoRef.current,
        (yaw, pitch) => orbRef.current?.rotateBy(yaw, pitch),
        factor => orbRef.current?.zoomBy(factor),
        (state, count) => {
          setCamera(state === 'on' ? 'ON' : state.toUpperCase());
          setHands(state === 'on' ? count : 0);
        },
        () => setOrange(v => !v),
        (nx, ny) => orbRef.current?.setHandPosition(nx, ny)
      );
      trackerRef.current = tracker;
      try { await tracker.start(); }
      catch (e) {
        console.warn('Camera/hand tracking unavailable:', e);
        trackerRef.current = null;
        setCamera('ERROR');
      }
    };
    const timer = setTimeout(start, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className={`reel-app ${orange ? 'orange' : 'blue'}`}>
      <canvas ref={canvasRef} className="reel-canvas" />
      <video ref={videoRef} className="hidden-camera" muted playsInline />
      <div className="reel-vignette" />
      <div className="reel-scanlines" />
      <div className="reel-status"><span className={`status-dot ${camera === 'ON' ? 'live' : ''}`} />CAMERA {camera}<span className="status-gap">•</span>HANDS {hands}</div>
      <div className="reel-state">{orange ? 'ACTIVE' : 'STANDBY'}</div>
    </main>
  );
}
