import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Camera } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';

const WS_URL = 'ws://192.168.0.100:3000'; // change IP as needed
const CAPTURE_INTERVAL_MS = 200;

export default function App() {
  const cameraRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const isCapturingRef = useRef(false);

  const [hasPermission, setHasPermission] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  useEffect(() => {
    let reconnectDelay = 1000;

    function connect() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WS open');
          setIsConnected(true);
          reconnectDelay = 1000;
        };

        ws.onmessage = (ev) => {
          // handle server messages if needed
          // console.log('server:', ev.data);
        };

        ws.onerror = (err) => {
          console.warn('WS error', err && err.message);
        };

        ws.onclose = () => {
          console.log('WS closed, will reconnect');
          setIsConnected(false);
          wsRef.current = null;
          // exponential-ish backoff
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
            connect();
          }, reconnectDelay);
        };
      } catch (e) {
        console.warn('WS connect failed', e.message);
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay);
      }
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    // Start capturing when we have camera permission and camera ref
    if (hasPermission) {
      captureIntervalRef.current = setInterval(async () => {
        const ws = wsRef.current;
        const cam = cameraRef.current;

        if (!ws || ws.readyState !== 1 || !cam) return;
        if (isCapturingRef.current) return;

        isCapturingRef.current = true;
        try {
          const photo = await cam.takePictureAsync({ base64: true, quality: 0.3, skipProcessing: true });
          if (photo && photo.base64 && ws && ws.readyState === 1) {
            const payload = JSON.stringify({ type: 'frame', data: photo.base64 });
            ws.send(payload);
          }
        } catch (e) {
          console.warn('capture error', e.message);
        } finally {
          isCapturingRef.current = false;
        }
      }, CAPTURE_INTERVAL_MS);
    }

    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
  }, [hasPermission]);

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text>No access to camera</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera style={styles.camera} ref={cameraRef} ratio="16:9" />
      <View style={styles.statusBar} pointerEvents="none">
        <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    width: width,
    height: height,
  },
  statusBar: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  statusText: {
    color: '#fff',
    fontWeight: '600',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
