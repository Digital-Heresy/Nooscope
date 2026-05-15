/**
 * WebSocket telemetry stream client with auto-reconnect.
 * Connects to Thriden and PersonaForge WebSocket endpoints.
 */
class TelemetryStream {
  constructor(name, url, callbacks) {
    this.name = name;
    this.url = url;
    this.callbacks = callbacks;
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.shouldReconnect = true;
  }

  // Auth note (Nooscope-r5kh): the browser never attaches a token here.
  // The admin variant of /ws/telemetry is gated by the `nooscope_admin`
  // cookie at the nginx layer, which then injects the bearer subprotocol
  // on the upstream upgrade. The public variant carries no auth at all.
  connect() {
    this.shouldReconnect = true;
    this._setStatus('reconnecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this._setStatus('connected');
      if (this.callbacks.onConnect) this.callbacks.onConnect(this.name);
    };

    this.ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (this.callbacks.onEvent) this.callbacks.onEvent(this.name, event);
      } catch (e) {
        console.warn(`[${this.name}] Failed to parse event:`, e);
      }
    };

    this.ws.onclose = () => {
      this._setStatus('disconnected');
      if (this.callbacks.onDisconnect) this.callbacks.onDisconnect(this.name);
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setStatus('disconnected');
  }

  _setStatus(status) {
    if (this.callbacks.onStatus) this.callbacks.onStatus(this.name, status);
  }

  _scheduleReconnect() {
    if (!this.shouldReconnect) return;
    setTimeout(() => {
      if (this.shouldReconnect) this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}
