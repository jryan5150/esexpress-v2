
# CarrierLocator


## Properties

Name | Type
------------ | -------------
`id` | number
`scac` | string
`name` | string
`city` | string
`state` | string
`mcId` | string
`dotId` | string

## Example

```typescript
import type { CarrierLocator } from '@pcs/dispatch-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "scac": null,
  "name": null,
  "city": null,
  "state": null,
  "mcId": null,
  "dotId": null,
} satisfies CarrierLocator

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CarrierLocator
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


