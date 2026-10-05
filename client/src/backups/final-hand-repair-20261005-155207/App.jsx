import { useCallback, useEffect, useRef, useState } from 'react';
import { ReelOrbEngine } from './orbEngine';
import { GestureController } from './gestureController';

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const orbRef = useRef(null);
  const gestureRef = useRef(null);

  const [mode, setMode] = useState('locked');
  const [cameraState, setCameraState] = useState('off');
  const [hands, setHands] = useState(0);
  const [message, setMessage] = useState('LISTENING');
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const orb = new ReelOrbEngine(canvas);

    // Mouse is disabled; hand controller drives rotate/zoom.
    canvas.style.pointerEvents = 'none';

    orb.setMode('locked');
    orb.start();
    orbRef.current = orb;

    return () => {
      gestureRef.current?.stop();
      gestureRef.current = null;
      orb.dispose();
      orbRef.current = null;
    };
  }, []);

  useEffect(() => {
    orbRef.current?.setMode(
      mode === 'alert' ? 'alert' : 'locked'
    );
  }, [mode]);

  const startGestures = useCallback(async () => {
    if (gestureRef.current || !videoRef.current) return;

    setError('');
    setCameraState('starting');
    setMessage('CAMERA INITIALIZING');

    try {
      const controller = new GestureController(
        videoRef.current,
        (yaw, pitch) => {
          orbRef.current?.rotateBy(yaw, pitch);
        },
        (factor) => {
          orbRef.current?.zoomBy(factor);
        },
        (state, count) => {
          if (state === 'on') {
            setCameraState('on');
            setHands(count);
            setMessage(
              count
                ? `${count} HAND${count > 1 ? 'S' : ''} · TRACKING`
                : 'SHOW HANDS'
            );
          } else if (state === 'loading') {
            setCameraState('starting');
          }
        },
        () => {
          // Victory sign is the ONLY thing allowed to change color.
          setMode((current) =>
            current === 'alert' ? 'locked' : 'alert'
          );
          setMessage('VICTORY · COLOR SHIFT');
          window.setTimeout(() => {
            setMessage('LISTENING');
          }, 900);
        }
      );

      gestureRef.current = controller;
      await controller.start();
    } catch (err) {
      gestureRef.current?.stop();
      gestureRef.current = null;
      setCameraState('error');
      setHands(0);
      setMessage('CAMERA ERROR');

      setError(
        err?.name === 'NotAllowedError'
          ? 'CAMERA ACCESS DENIED'
          : 'HAND TRACKING UNAVAILABLE'
      );
    }
  }, []);

  const stopGestures = useCallback(() => {
    gestureRef.current?.stop();
    gestureRef.current = null;
    setCameraState('off');
    setHands(0);
    setMessage('LISTENING');
  }, []);

  const toggleGestures = useCallback(() => {
    if (gestureRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  const sendToJarvis = useCallback(async () => {
    setError('');
    setMessage('THINKING');

    try {
      const r = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Say exactly: Systems online. JARVIS core ready.'
        })
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(
          data.error || 'Backend unavailable'
        );
      }

      setMessage('ONLINE');

      const tts = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: data.answer || 'Systems online.'
        })
      });

      if (!tts.ok) {
        setMessage('LISTENING');
        return;
      }

      const blob = await tts.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        setMessage('LISTENING');
      };

      void audio.play();
    } catch (err) {
      setError(
        err.message || 'JARVIS backend unavailable'
      );
      setMessage('LISTENING');
    }
  }, []);

  // Start camera + hand tracking automatically.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startGestures();
    }, 900);

    const onKey = (e) => {
      if (e.key === 'g' || e.key === 'G') {
        toggleGestures();
      }

      if (e.key === 'r' || e.key === 'R') {
        orbRef.current?.resetView();
      }

      // Keyboard zoom remains as a developer fallback,
      // but mouse wheel/drag are disabled.
      if (e.key === '+' || e.key === '=') {
        orbRef.current?.zoomIn();
      }

      if (e.key === '-' || e.key === '_') {
        orbRef.current?.zoomOut();
      }

      if (e.code === 'Space') {
        e.preventDefault();
        void sendToJarvis();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [startGestures, toggleGestures, sendToJarvis]);

  return (
    <main
      className={`reel-shell ${
        mode === 'alert' ? 'is-alert' : ''
      }`}
    >
      <canvas
        ref={canvasRef}
        className="reel-canvas"
      />

      <video
        ref={videoRef}
        className="hidden-camera"
        muted
        playsInline
      />

      <div className="reel-noise" />
      <div className="reel-scanlines" />
      <div className="reel-topline" />

      <div className="reel-brand">
        <strong>J.A.R.V.I.S.</strong>
        <span>PERSONAL INTELLIGENCE CORE</span>
      </div>

      <div className="reel-status">
        <span className="status-dot" />
        <span>OFFLINE VOICE ONLINE</span>
        <span>
          CAMERA{' '}
          {cameraState === 'on'
            ? 'CONNECTED'
            : cameraState.toUpperCase()}
        </span>
        <span>
          HAND CONTROL{' '}
          {hands ? 'ACTIVE' : 'STANDBY'}
        </span>
      </div>

      <div className="reel-core-label">
        <span>JARVIS CORE</span>
        <strong>{message}</strong>
      </div>

      <div className="reel-controls">
        <button
          onClick={toggleGestures}
          aria-label="Toggle hand control"
        >
          {cameraState === 'starting'
            ? 'CAMERA…'
            : cameraState === 'on'
              ? 'GESTURES ON'
              : 'GESTURES OFF'}
        </button>

        <button
          onClick={() => orbRef.current?.resetView()}
          aria-label="Reset orb"
        >
          RESET
        </button>
      </div>

      <button
        className="reel-hotspot"
        onClick={() => void sendToJarvis()}
        aria-label="Activate JARVIS"
      />

      {error && (
        <div className="reel-error">
          {error}
        </div>
      )}
    </main>
  );
}
