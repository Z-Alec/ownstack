#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "./version.js";
import { registerInit } from "./cli/init.js";
import { registerValidate } from "./cli/validate.js";

const program = new Command()
  .name("ownstack")
  .description("Your own coding-agent stack, from one config file.")
  .version(VERSION);

registerInit(program);
registerValidate(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
