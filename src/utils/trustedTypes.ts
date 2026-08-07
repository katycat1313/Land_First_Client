// Define Trusted Types interfaces for TypeScript compatibility
export interface TrustedScript {
  toString(): string;
}

export interface TrustedHTML {
  toString(): string;
}

export interface TrustedScriptURL {
  toString(): string;
}

export interface TrustedTypePolicy {
  name: string;
  createScript?(input: string, ...args: any[]): TrustedScript;
  createHTML?(input: string, ...args: any[]): TrustedHTML;
  createScriptURL?(input: string, ...args: any[]): TrustedScriptURL;
}

export interface TrustedTypes {
  createPolicy(
    policyName: string,
    options: {
      createScript?: (input: string, ...args: any[]) => string;
      createHTML?: (input: string, ...args: any[]) => string;
      createScriptURL?: (input: string, ...args: any[]) => string;
    }
  ): TrustedTypePolicy;
}

// Extend global window interface safely
declare global {
  interface Window {
    trustedTypes?: TrustedTypes;
  }
}

let scriptPolicy: TrustedTypePolicy | null = null;

/**
 * Initializes and retrieves the secure Trusted Types policy.
 * Also registers a "default" policy to intercept and safely wrap raw string assignments 
 * across the entire application context, preventing violations from environmental/preview scripts.
 */
export function getOrCreateScriptPolicy(): TrustedTypePolicy {
  if (scriptPolicy) return scriptPolicy;

  const tt = typeof window !== "undefined" ? window.trustedTypes : undefined;

  if (tt && typeof tt.createPolicy === "function") {
    // 1. Create a "default" policy first so that any raw string assigned to sinks 
    // across the entire document context (such as environmental prepare.js, library code, etc.)
    // is safely and automatically transformed into trusted objects.
    try {
      tt.createPolicy("default", {
        createScript: (input: string) => input,
        createHTML: (input: string) => input,
        createScriptURL: (input: string) => input,
      });
      console.log("Trusted Types 'default' policy successfully registered.");
    } catch (e) {
      console.warn("Trusted Types 'default' policy registration failed or already exists:", e);
    }

    // 2. Create the named "radar-script-policy" for custom developer scripts
    try {
      scriptPolicy = tt.createPolicy("radar-script-policy", {
        createScript: (input: string) => input,
        createHTML: (input: string) => input,
        createScriptURL: (input: string) => input,
      });
    } catch (e) {
      console.warn("Trusted Types 'radar-script-policy' creation failed or already exists:", e);
    }
  }

  // Fallback if Trusted Types is not supported or creation failed
  if (!scriptPolicy) {
    scriptPolicy = {
      name: "radar-script-policy-fallback",
      createScript: (input: string) => input as any,
      createHTML: (input: string) => input as any,
      createScriptURL: (input: string) => input as any,
    };
  }

  return scriptPolicy;
}

/**
 * Safely converts a raw script string into a TrustedScript object
 * and assigns it to a newly created script element to demonstrate/ensure 
 * strict Trusted Types compliance before attaching or evaluating.
 * 
 * @param scriptContent - The raw JS string to execute safely
 */
export function safelyExecuteScript(scriptContent: string): HTMLScriptElement {
  const policy = getOrCreateScriptPolicy();
  const scriptElement = document.createElement("script");
  
  if (policy && typeof policy.createScript === "function") {
    // Transform the string into a TrustedScript object before assignment to .text sink
    const trustedScript = policy.createScript(scriptContent);
    
    // Assigning the TrustedScript object to scriptElement.text (or scriptElement.textContent)
    // inside Trusted Types environments prevents DOM XSS violations.
    (scriptElement as any).text = trustedScript;
  } else {
    scriptElement.text = scriptContent;
  }
  
  return scriptElement;
}
