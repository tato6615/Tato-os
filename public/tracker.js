(function () {
  const SESSION_KEY = "tato_session_id";

  function getSessionId() {
    let sessionId = localStorage.getItem(SESSION_KEY);

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sessionId);
    }

    return sessionId;
  }

  async function track(eventType, data = {}) {
    const payload = {
      session_id: getSessionId(),
      event_type: eventType,
      page: window.location.pathname,
      customer_id: data.customer_id || null,
      product_id: data.product_id || null,
      metadata: {
        ...data.metadata,
        url: window.location.href,
        title: document.title,
        referrer: document.referrer || null
      }
    };

    try {
      const response = await fetch("/api/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      return await response.json();
    } catch (error) {
      console.error("TATO tracking error:", error);
      return null;
    }
  }

  window.TATOTracker = {
    getSessionId,
    track
  };

  track("page_view");
})();
