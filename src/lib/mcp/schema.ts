import { z } from "zod";

// Converts the agent registry's plain-JSON-Schema tool inputs into Zod v4
// objects, which is what @modelcontextprotocol/server's registerTool accepts.
// Only covers the shapes tools.ts actually uses: flat objects whose props are
// string | number | integer | boolean | enum | array, with per-prop
// descriptions and a top-level `required` list.

type Json = Record<string, unknown>;

function propToZod(prop: Json): z.ZodType {
  const desc = typeof prop.description === "string" ? prop.description : undefined;
  let schema: z.ZodType;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    schema = z.enum(prop.enum.map(String) as [string, ...string[]]);
  } else {
    switch (prop.type) {
      case "number":
      case "integer":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "array":
        schema = z.array(propToZod((prop.items as Json) ?? { type: "string" }));
        break;
      default:
        schema = z.string();
    }
  }
  return desc ? schema.describe(desc) : schema;
}

export function jsonSchemaToZodObject(schema: Json): z.ZodObject<Record<string, z.ZodType>> {
  const props = (schema.properties as Record<string, Json> | undefined) ?? {};
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  );
  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(props)) {
    const base = propToZod(prop);
    shape[key] = required.has(key) ? base : base.optional();
  }
  return z.object(shape);
}
