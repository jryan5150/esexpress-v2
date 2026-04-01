
# FaultDetailsInner


## Properties

Name | Type
------------ | -------------
`fields` | Array&lt;string&gt;
`errorCode` | number
`errorMessage` | string

## Example

```typescript
import type { FaultDetailsInner } from '@pcs/invoice-api'

// TODO: Update the object below with actual values
const example = {
  "fields": null,
  "errorCode": null,
  "errorMessage": null,
} satisfies FaultDetailsInner

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FaultDetailsInner
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


