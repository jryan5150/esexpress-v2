
# GetLoad200Response


## Properties

Name | Type
------------ | -------------
`loadId` | number
`status` | string
`loadClass` | string
`loadType` | string
`billToId` | string
`billToName` | string
`loadReference` | string
`billingType` | string
`milesBilled` | number
`totalWeight` | number
`pallets` | number
`notes` | string
`reference1` | string
`office` | [Office](Office.md)
`rating` | [LoadRating](LoadRating.md)
`stops` | [Array&lt;LoadStop&gt;](LoadStop.md)
`boundary` | string
`bookingNumber` | string
`container` | string
`chassis` | string

## Example

```typescript
import type { GetLoad200Response } from '@pcs/load-api'

// TODO: Update the object below with actual values
const example = {
  "loadId": null,
  "status": null,
  "loadClass": null,
  "loadType": null,
  "billToId": null,
  "billToName": null,
  "loadReference": null,
  "billingType": null,
  "milesBilled": null,
  "totalWeight": null,
  "pallets": null,
  "notes": null,
  "reference1": null,
  "office": null,
  "rating": null,
  "stops": null,
  "boundary": null,
  "bookingNumber": null,
  "container": null,
  "chassis": null,
} satisfies GetLoad200Response

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GetLoad200Response
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


