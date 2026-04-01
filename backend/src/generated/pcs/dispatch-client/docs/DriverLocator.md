
# DriverLocator


## Properties

Name | Type
------------ | -------------
`id` | number
`firstName` | string
`lastName` | string
`middleInitial` | string

## Example

```typescript
import type { DriverLocator } from '@pcs/dispatch-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "firstName": null,
  "lastName": null,
  "middleInitial": null,
} satisfies DriverLocator

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DriverLocator
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


