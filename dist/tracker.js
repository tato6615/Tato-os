(function () {
  const SESSION_KEY = "tato_session_id";
  const START_KEY = "tato_session_start";

  function getSessionId() {
    let sessionId = localStorage.getItem(SESSION_KEY);

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sessionId);
    }

    return sessionId;
  }

  function getSessionStart() {
    let start = sessionStorage.getItem(START_KEY);

    if (!start) {
      start = Date.now().toString();
      sessionStorage.setItem(START_KEY, start);
    }

    return Number(start);
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
        referrer: document.referrer || null,
        timestamp: new Date().toISOString()
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

  function trackClick(element) {
    const label =
      element.dataset.trackLabel ||
      element.innerText?.trim() ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.tagName;

    track("click", {
      metadata: {
        label: label.substring(0, 200),
        element: element.tagName.toLowerCase()
      }
    });
  }

  function trackProductView(productId) {
    if (!productId) return;

    track("product_view", {
      product_id: productId
    });
  }

  function trackSearch(query) {
    if (!query || !query.trim()) return;

    track("search", {
      metadata: {
        query: query.trim().substring(0, 200)
      }
    });
  }

  function trackCustomerCreated(customerId) {
    track("customer_created", {
      customer_id: customerId
    });
  }

  function trackOrderCreated(orderId, customerId, productId, amount) {
    track("order_created", {
      customer_id: customerId || null,
      product_id: productId || null,
      metadata: {
        order_id: orderId || null,
        amount: Number(amount || 0)
      }
    });
  }

  function trackAIRun(runId, runType, model) {
    track("ai_run", {
      metadata: {
        run_id: runId || null,
        run_type: runType || null,
        model: model || null
      }
    });
  }

  function trackWorkflowRun(workflowId, workflowName) {
    track("workflow_run", {
      metadata: {
        workflow_id: workflowId || null,
        workflow_name: workflowName || null
      }
    });
  }

  function trackTimeSpent() {
    const seconds = Math.round(
      (Date.now() - getSessionStart()) / 1000
    );

    track("session_end", {
      metadata: {
        seconds
      }
    });
  }

  document.addEventListener("click", function (event) {
    const element = event.target.closest(
      "button, a, [role='button'], [data-track]"
    );

    if (element) {
      trackClick(element);
    }
  });

  window.addEventListener("beforeunload", function () {
    trackTimeSpent();
  });

  window.TATOTracker = {
    getSessionId,
    track,
    trackClick,
    trackProductView,
    trackSearch,
    trackCustomerCreated,
    trackOrderCreated,
    trackAIRun,
    trackWorkflowRun,
    trackTimeSpent
  };

  getSessionStart();
  track("session_start");
  track("page_view");
})();
