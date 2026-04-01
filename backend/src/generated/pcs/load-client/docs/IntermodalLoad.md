
# IntermodalLoad


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
`boundary` | string
`bookingNumber` | string
`milesBilled` | number
`container` | string
`chassis` | string
`reference1` | string
`notes` | string
`office` | [Office](Office.md)
`stops` | [Array&lt;LoadStop&gt;](LoadStop.md)

## Example

```typescript
import type { IntermodalLoad } from '@pcs/load-api'

// TODO: Update the object below with actual values
const example = {
  "loadId": null,
  "status": null,
  "loadClass": null,
  "loadType": null,
  "billToId": null,
  "billToName": null,
  "loadReference": null,
  "boundary": null,
  "bookingNumber": null,
  "milesBilled": null,
  "container": null,
  "chassis": null,
  "reference1": null,
  "notes": null,
  "office": null,
  "stops": null,
} satisfies IntermodalLoad

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as IntermodalLoad
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


