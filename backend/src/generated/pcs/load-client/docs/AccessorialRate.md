
# AccessorialRate


## Properties

Name | Type
------------ | -------------
`id` | number
`accessorialLocator` | [AccessorialLocator](AccessorialLocator.md)
`matrixId` | number
`refNumber` | string
`rate` | number
`units` | number
`notes` | string

## Example

```typescript
import type { AccessorialRate } from '@pcs/load-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "accessorialLocator": null,
  "matrixId": null,
  "refNumber": null,
  "rate": null,
  "units": null,
  "notes": null,
} satisfies AccessorialRate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AccessorialRate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


