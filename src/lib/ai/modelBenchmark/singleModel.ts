import { getUserFacingAIError, parseAPIError, parseHTTPError } from '../errors';
import { isErrorNamed, readErrorField } from '../errorClassification';
import { buildAnthropicBaseUrl, buildOpenAIBaseUrl, resolveApiModelId } from '../utils';
import { providerFetch } from '../providerHttp';
import type { AIModel, Provider } from '../types';
import {
  isManagedProviderId,
  reportManagedDesktopClientDiagnostic,
  requestManagedChatCompletion,
} from '../managedService';
import {
  getAlternateEndpointType,
  getVerifiedModelEndpointType,
  isLikelyAnthropicModel,
  shouldTryAlternateEndpointAfterEndpointError,
} from '../endpointFallback';
import { DEFAULT_BENCHMARK_TIMEOUT_MS } from './constants';
import { inferBenchmarkEndpoint } from './endpoint';
import type { BenchmarkEndpoint, CheckModelHealthOptions, HealthCheckResult } from './types';
import {
  isExpectedSuccessPayload,
  parseResponsePayload,
  readBenchmarkResponseText,
  readErrorMessage,
} from './singleModelPayload';

const BENCHMARK_TEXT_PROMPT = 'say 6';
const BENCHMARK_TEXT_MAX_OUTPUT_TOKENS = 128;
const UNEXPECTED_BENCHMARK_RESPONSE = 'Unexpected benchmark response';

function buildBenchmarkUrl(provider: Provider, endpoint: BenchmarkEndpoint, endpointType?: Provider['endpointType']): string {
  if (endpointType === 'anthropic') {
    return `${buildAnthropicBaseUrl(provider.apiHost)}/messages`;
  }

  const baseUrl = buildOpenAIBaseUrl(provider.apiHost);

  if (endpoint === 'embeddings') {
    return `${baseUrl}/embeddings`;
  }

  if (endpoint === 'image') {
    return `${baseUrl}/images/generations`;
  }

  if (endpoint === 'responses') {
    return `${baseUrl}/responses`;
  }

  return `${baseUrl}/chat/completions`;
}

function isAbortError(error: unknown): boolean {
  return isErrorNamed(error, 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw new DOMException('Aborted', 'AbortError');
}

function buildBenchmarkBody(
  modelId: string,
  endpoint: BenchmarkEndpoint,
  endpointType?: Provider['endpointType']
): Record<string, unknown> {
  if (endpoint === 'chat') {
    const chatBody: Record<string, unknown> = {
      model: modelId,
      messages: [{ role: 'user', content: BENCHMARK_TEXT_PROMPT }],
      stream: false,
    };

    if (endpointType === 'anthropic') {
      chatBody.max_tokens = BENCHMARK_TEXT_MAX_OUTPUT_TOKENS;
    } else {
      chatBody.max_completion_tokens = BENCHMARK_TEXT_MAX_OUTPUT_TOKENS;
    }

    return chatBody;
  }

  if (endpoint === 'embeddings') {
    return {
      model: modelId,
      input: 'hello world',
    };
  }

  if (endpoint === 'image') {
    return {
      model: modelId,
      prompt: 'a cute cat',
      n: 1,
      size: '1024x1024',
    };
  }

  if (endpoint === 'responses') {
    return {
      model: modelId,
      input: BENCHMARK_TEXT_PROMPT,
      max_output_tokens: BENCHMARK_TEXT_MAX_OUTPUT_TOKENS,
    };
  }

  return {};
}

function buildBenchmarkHeaders(provider: Provider): Record<string, string> {
  const endpointType = provider.endpointType;
  if (endpointType === 'anthropic') {
    return {
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json',
    };
  }

  return {
    Authorization: `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function checkModelHealth(
  provider: Provider,
  model: AIModel,
  options: CheckModelHealthOptions = {}
): Promise<HealthCheckResult> {
  const apiModelId = resolveApiModelId(model);
  const verifiedModelEndpointType = getVerifiedModelEndpointType(model);
  const endpointType = verifiedModelEndpointType ?? provider.endpointType;
  const endpoint = endpointType === 'anthropic' ? 'chat' : inferBenchmarkEndpoint(apiModelId);
  const requestedTimeoutMs = options.timeoutMs ?? DEFAULT_BENCHMARK_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.max(0, Math.floor(requestedTimeoutMs))
    : DEFAULT_BENCHMARK_TIMEOUT_MS;
  const start = performance.now();
  const controller = new AbortController();
  const externalSignal = options.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let detachExternalAbort: (() => void) | undefined;
  let didTimeout = false;
  let didAbortExternally = externalSignal?.aborted ?? false;
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      const forwardAbort = () => {
        didAbortExternally = true;
        controller.abort();
      };
      externalSignal.addEventListener('abort', forwardAbort);
      detachExternalAbort = () => externalSignal.removeEventListener('abort', forwardAbort);
    }
  }

  const toErrorResult = (error: unknown, resultEndpoint: BenchmarkEndpoint): HealthCheckResult => {
    if (isAbortError(error) && (didTimeout || didAbortExternally)) {
      return {
        status: 'error',
        error: didTimeout
          ? `Request timed out (${Math.round(timeoutMs / 1000)}s)`
          : 'Request aborted',
        endpoint: resultEndpoint,
      };
    }

    const parsedError = parseAPIError(error);
    return {
      status: 'error',
      error: parsedError.message === UNEXPECTED_BENCHMARK_RESPONSE
        ? UNEXPECTED_BENCHMARK_RESPONSE
        : getUserFacingAIError(error, { managed: isManagedProviderId(provider.id) }).message,
      endpoint: resultEndpoint,
    };
  };

  if (isManagedProviderId(provider.id)) {
    try {
      const payload = await requestManagedChatCompletion({
        model: apiModelId,
        messages: [{ role: 'user', content: BENCHMARK_TEXT_PROMPT }],
        stream: false,
        max_completion_tokens: BENCHMARK_TEXT_MAX_OUTPUT_TOKENS,
      }, controller.signal);
      throwIfAborted(controller.signal);
      if (readErrorMessage(payload) || !isExpectedSuccessPayload(payload, 'chat')) {
        throw new Error(readErrorMessage(payload) || UNEXPECTED_BENCHMARK_RESPONSE);
      }
      return {
        status: 'success',
        latency: Math.round(performance.now() - start),
        endpoint: 'chat',
      };
    } catch (error: unknown) {
      const result = toErrorResult(error, 'chat');
      const errorCode = readErrorField(error, 'errorCode');
      const statusCode = readErrorField(error, 'statusCode');
      const diagnosticCode = didTimeout
        ? 'model_benchmark_timeout'
        : result.error === UNEXPECTED_BENCHMARK_RESPONSE
          ? 'unexpected_benchmark_response'
          : typeof errorCode === 'string'
            ? errorCode
            : 'model_benchmark_failed';
      if (!didAbortExternally) {
        void reportManagedDesktopClientDiagnostic({
          kind: 'chat_json',
          source: 'managed_desktop_json',
          phase: 'json_response',
          model: apiModelId,
          isStream: false,
          errorCode: diagnosticCode,
          message: result.error,
          ...(typeof statusCode === 'number' ? { statusCode } : {}),
        }).catch(() => undefined);
      }
      return result;
    } finally {
      detachExternalAbort?.();
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  const runBenchmarkAttempt = async (attemptEndpointType: Provider['endpointType'] | undefined): Promise<HealthCheckResult> => {
    const attemptEndpoint = attemptEndpointType === 'anthropic' ? 'chat' : inferBenchmarkEndpoint(apiModelId);
    if (controller.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const response = await providerFetch(buildBenchmarkUrl(provider, attemptEndpoint, attemptEndpointType), {
      method: 'POST',
      headers: buildBenchmarkHeaders({ ...provider, endpointType: attemptEndpointType }),
      body: JSON.stringify(buildBenchmarkBody(apiModelId, attemptEndpoint, attemptEndpointType)),
      signal: controller.signal,
    });
    throwIfAborted(controller.signal);

    if (!response.ok) {
      const errorText = await readBenchmarkResponseText(response, controller.signal, 'Unknown error');
      let errorBody: unknown;
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = { message: errorText };
      }
      throw parseHTTPError(response.status, errorBody);
    }

    const payload = await parseResponsePayload(response, controller.signal);
    const upstreamErrorMessage = readErrorMessage(payload);
    if (upstreamErrorMessage) {
      throw new Error(upstreamErrorMessage);
    }

    if (!isExpectedSuccessPayload(payload, attemptEndpoint)) {
      throw new Error(UNEXPECTED_BENCHMARK_RESPONSE);
    }

    return {
      status: 'success',
      latency: Math.round(performance.now() - start),
      endpoint: attemptEndpoint,
    };
  };

  try {
    return await runBenchmarkAttempt(endpointType);
  } catch (error: unknown) {
    const canTryAlternateFallback =
      endpoint === 'chat' &&
      isLikelyAnthropicModel(model) &&
      !controller.signal.aborted &&
      shouldTryAlternateEndpointAfterEndpointError(error);

    if (canTryAlternateFallback) {
      const alternateEndpointType = getAlternateEndpointType(endpointType);
      try {
        return await runBenchmarkAttempt(alternateEndpointType);
      } catch (fallbackError: unknown) {
        return toErrorResult(fallbackError, 'chat');
      }
    }

    return toErrorResult(error, endpoint);
  } finally {
    detachExternalAbort?.();
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
