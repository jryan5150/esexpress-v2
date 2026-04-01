
# Fault


## Properties

Name | Type
------------ | -------------
`timestamp` | Date
`operation` | string
`message` | string
`details` | [Array&lt;FaultDetailsInner&gt;](FaultDetailsInner.md)

## Example

```typescript
import type { Fault } from '@pcs/file-api'

// TODO: Update the object below with actual values
const example = {
  "timestamp": null,
  "operation": null,
  "message": null,
  "details": null,
} satisfies Fault

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Fault
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


