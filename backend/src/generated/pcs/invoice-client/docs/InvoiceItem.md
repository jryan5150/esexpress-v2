
# InvoiceItem


## Properties

Name | Type
------------ | -------------
`id` | number
`amount` | number
`accountNumber` | string
`itemCode` | string
`office` | [Office](Office.md)
`memo` | string
`internalReference` | string
`externalReference` | string
`userDefinedField` | string

## Example

```typescript
import type { InvoiceItem } from '@pcs/invoice-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "amount": null,
  "accountNumber": null,
  "itemCode": null,
  "office": null,
  "memo": null,
  "internalReference": null,
  "externalReference": null,
  "userDefinedField": null,
} satisfies InvoiceItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as InvoiceItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


