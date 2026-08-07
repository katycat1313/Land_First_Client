/**
 * Gmail REST API integration utilities.
 * Handles client-side fetch requests to the official Google Gmail APIs.
 */

// Helper to encode a string safely to Base64url (required by Gmail raw API)
export function base64urlEncode(str: string): string {
  // Use encodeURIComponent to support non-ASCII characters, then escape it correctly
  const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  });
  return btoa(utf8Bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Extract message body from Google Gmail API Message resource
export function getMessageBody(message: any): string {
  if (!message.payload) return message.snippet || "";

  const extractFromPart = (part: any): string => {
    if (part.body && part.body.data) {
      try {
        const base64 = part.body.data.replace(/-/g, "+").replace(/_/g, "/");
        // Decode base64 to original utf-8
        const decoded = atob(base64);
        try {
          return decodeURIComponent(
            decoded
              .split("")
              .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
              .join("")
          );
        } catch {
          return decoded;
        }
      } catch (e) {
        return part.snippet || "";
      }
    }
    if (part.parts) {
      for (const subPart of part.parts) {
        const res = extractFromPart(subPart);
        if (res) return res;
      }
    }
    return "";
  };

  const body = extractFromPart(message.payload);
  return body || message.snippet || "";
}

// Parse headers to get a specific header value
export function getHeader(message: any, name: string): string {
  const headers = message.payload?.headers || [];
  const found = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : "";
}

/**
 * Sends a brand new email or a threaded reply via the Gmail API
 */
export async function sendGmailEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string,
  inReplyToMessageId?: string
): Promise<{ messageId: string; threadId: string }> {
  let headers: string[] = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`
  ];

  if (threadId && inReplyToMessageId) {
    headers.push(`In-Reply-To: ${inReplyToMessageId}`);
    headers.push(`References: ${inReplyToMessageId}`);
  }

  const mimeMessage = `${headers.join("\n")}\n\n${body}`;
  const raw = base64urlEncode(mimeMessage);

  const payload: any = { raw };
  if (threadId) {
    payload.threadId = threadId;
  }

  const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gmail Send API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return {
    messageId: data.id,
    threadId: data.threadId
  };
}

/**
 * Retrieves the message list in a thread and formats it
 */
export async function fetchGmailThread(
  accessToken: string,
  threadId: string
): Promise<Array<{ id: string; from: string; to: string; date: string; snippet: string; body: string; isOutbound: boolean }>> {
  const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/threads/${threadId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gmail Thread Fetch error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const messages = data.messages || [];

  return messages.map((msg: any) => {
    const fromHeader = getHeader(msg, "from");
    const toHeader = getHeader(msg, "to");
    const dateHeader = getHeader(msg, "date");
    const parsedBody = getMessageBody(msg);

    // Estimate if message is outbound (sent by the user) by inspecting "from" header
    // In Gmail REST API, the user's messages have labelIds containing "SENT"
    const labels = msg.labelIds || [];
    const isOutbound = labels.includes("SENT") || fromHeader.toLowerCase().includes("me") || fromHeader.toLowerCase().includes("katycat1313@gmail.com");

    return {
      id: msg.id,
      from: fromHeader,
      to: toHeader,
      date: dateHeader || new Date(Number(msg.internalDate)).toLocaleString(),
      snippet: msg.snippet || "",
      body: parsedBody,
      isOutbound
    };
  });
}
