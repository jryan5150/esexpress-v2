
# LineHaulRate


## Properties

Name | Type
------------ | -------------
`rateType` | string
`rate` | number
`matrixId` | number
`isManual` | boolean
`isMatrix` | boolean

## Example

```typescript
import type { LineHaulRate } from '@pcs/dispatch-api'

// TODO: Update the object below with actual values
const example = {
  "rateType": null,
  "rate": null,
  "matrixId": null,
  "isManual": null,
  "isMatrix": null,
} satisfies LineHaulRate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as LineHaulRate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


