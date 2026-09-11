import assert from "node:assert/strict";
import { missingCustomTools } from "./tool-setup";
assert.equal(missingCustomTools([{name:"CRM"}], [{toolName:"Unrelated"}]), 1);
assert.equal(missingCustomTools([{name:"CRM"},{name:"Docs"}], [{toolName:"CRM"}]), 1);
assert.equal(missingCustomTools([{name:"CRM"},{name:"CRM"}], []), 1);
assert.equal(missingCustomTools([{name:"CRM"}], [{toolName:"CRM"}]), 0);
assert.equal(missingCustomTools([null,{},"CRM",{name:""}], []), 0);
assert.equal(missingCustomTools(null, []), 0);
console.log("tool setup: 6 checks passed");
