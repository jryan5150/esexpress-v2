
# Address


## Properties

Name | Type
------------ | -------------
`countrySubDivisionCode` | string
`city` | string
`line1` | string
`postalCode` | string

## Example

```typescript
import type { Address } from '@pcs/load-api'

// TODO: Update the object below with actual values
const example = {
  "countrySubDivisionCode": null,
  "city": null,
  "line1": null,
  "postalCode": null,
} satisfies Address

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Address
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


