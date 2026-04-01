
# PatchDocument

A JSONPatch document as defined by RFC 6902

## Properties

Name | Type
------------ | -------------
`op` | string
`path` | string
`value` | object

## Example

```typescript
import type { PatchDocument } from '@pcs/invoice-api'

// TODO: Update the object below with actual values
const example = {
  "op": null,
  "path": null,
  "value": null,
} satisfies PatchDocument

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PatchDocument
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


