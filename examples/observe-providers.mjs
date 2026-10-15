import { createTraceClient } from '../sdk/client.mjs';
import { createProviderObservers } from '../sdk/provider-adapters.mjs';

// A real provider request: explicitly opt in and supply the API credential
// from an environment variable. Never put secrets in repository files.
const provider = process.argv[2] || 'ollama';
const token = process.env.MINDTRACE_TOKEN;
if (!token) throw new Error('Set MINDTRACE_TOKEN before using this example.');
if (!['openai', 'anthropic', 'ollama'].includes(provider)) {
  throw new Error('Usage: node examples/observe-providers.mjs openai|anthropic|ollama');
}
const sdk = createTraceClient({ token, source: 'provider-observer-example' });
const observers = createProviderObservers({ traceClient: sdk,
  onTraceError: warning => console.warn(warning),
});
let response;
if (provider === 'openai') {
  if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY.');
  response = await observers.openaiResponses({
    apiKey: process.env.OPENAI_API_KEY,
    body: { model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', input: 'Say hello in one sentence.' },
  });
} else if (provider === 'anthropic') {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY.');
  response = await observers.anthropicMessages({
    apiKey: process.env.ANTHROPIC_API_KEY,
    body: { model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 64, messages: [{ role: 'user', content: 'Say hello in one sentence.' }] },
  });
} else {
  response = await observers.ollamaChat({
    body: { model: process.env.OLLAMA_MODEL || 'llama3.2',
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }] },
  });
}
// Keep provider response in memory. Never print it or send it to collector.
// The graph contains only provider, model ID, HTTP/usage metrics and tool counts.
console.log('Provider request completed:', provider, 'response received:', Boolean(response));
