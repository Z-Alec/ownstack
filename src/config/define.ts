import type {
  BedrockInput,
  EndpointInput,
  LitellmInput,
  OpencodeInput,
  SkypilotGpuInput,
  StackInput,
} from "./schema.js";

type Args<T> = Omit<T, "kind">;

export function defineStack(input: StackInput): StackInput {
  return input;
}

export function opencode(opts: Args<OpencodeInput>): OpencodeInput {
  return { ...opts, kind: "opencode" };
}

export function litellm(opts: Args<LitellmInput> = {}): LitellmInput {
  return { ...opts, kind: "litellm" };
}

export function bedrock(opts: Args<BedrockInput>): BedrockInput {
  return { ...opts, kind: "bedrock" };
}

export function skypilotGpu(opts: Args<SkypilotGpuInput>): SkypilotGpuInput {
  return { ...opts, kind: "skypilotGpu" };
}

export function endpoint(opts: Args<EndpointInput>): EndpointInput {
  return { ...opts, kind: "endpoint" };
}
