
# LoadStop


## Properties

Name | Type
------------ | -------------
`id` | number
`order` | number
`type` | string
`zone` | string
`availableFrom` | Date
`availableFromIsLocal` | boolean
`availableTo` | Date
`availableToIsLocal` | boolean
`miles` | number
`referenceNumber` | string
`notes` | string
`phone` | string
`contact` | string
`companyName` | string
`address` | [Address](Address.md)

## Example

```typescript
import type { LoadStop } from '@pcs/load-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "order": null,
  "type": null,
  "zone": null,
  "availableFrom": null,
  "availableFromIsLocal": null,
  "availableTo": null,
  "availableToIsLocal": null,
  "miles": null,
  "referenceNumber": null,
  "notes": null,
  "phone": null,
  "contact": null,
  "companyName": null,
  "address": null,
} satisfies LoadStop

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as LoadStop
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


