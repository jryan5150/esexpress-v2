# LoadImageFileAttachmentsApi

All URIs are relative to *https://api.pcssoft.com/api*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**loadLoadIdAttachmentsAttachmentNameGet**](LoadImageFileAttachmentsApi.md#loadloadidattachmentsattachmentnameget) | **GET** /load/{loadId}/attachments/{attachmentName} |  |
| [**loadLoadIdAttachmentsGet**](LoadImageFileAttachmentsApi.md#loadloadidattachmentsget) | **GET** /load/{loadId}/attachments |  |
| [**loadLoadIdAttachmentsLoadAttachmentTypePost**](LoadImageFileAttachmentsApi.md#loadloadidattachmentsloadattachmenttypepost) | **POST** /load/{loadId}/attachments/{loadAttachmentType} |  |



## loadLoadIdAttachmentsAttachmentNameGet

> loadLoadIdAttachmentsAttachmentNameGet(loadId, attachmentName, username)



Download a specific file attachment from a load.

### Example

```ts
import {
  Configuration,
  LoadImageFileAttachmentsApi,
} from '@pcs/file-api';
import type { LoadLoadIdAttachmentsAttachmentNameGetRequest } from '@pcs/file-api';

async function example() {
  console.log("🚀 Testing @pcs/file-api SDK...");
  const api = new LoadImageFileAttachmentsApi();

  const body = {
    // number
    loadId: 56,
    // string
    attachmentName: attachmentName_example,
    // string | Must be a valid TMS user which will be recorded as the user performing the operation. (optional)
    username: username_example,
  } satisfies LoadLoadIdAttachmentsAttachmentNameGetRequest;

  try {
    const data = await api.loadLoadIdAttachmentsAttachmentNameGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **loadId** | `number` |  | [Defaults to `undefined`] |
| **attachmentName** | `string` |  | [Defaults to `undefined`] |
| **username** | `string` | Must be a valid TMS user which will be recorded as the user performing the operation. | [Optional] [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Success |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## loadLoadIdAttachmentsGet

> loadLoadIdAttachmentsGet(loadId, username)



List file attachments on a load.

### Example

```ts
import {
  Configuration,
  LoadImageFileAttachmentsApi,
} from '@pcs/file-api';
import type { LoadLoadIdAttachmentsGetRequest } from '@pcs/file-api';

async function example() {
  console.log("🚀 Testing @pcs/file-api SDK...");
  const api = new LoadImageFileAttachmentsApi();

  const body = {
    // number
    loadId: 56,
    // string | Must be a valid TMS user which will be recorded as the user performing the operation. (optional)
    username: username_example,
  } satisfies LoadLoadIdAttachmentsGetRequest;

  try {
    const data = await api.loadLoadIdAttachmentsGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **loadId** | `number` |  | [Defaults to `undefined`] |
| **username** | `string` | Must be a valid TMS user which will be recorded as the user performing the operation. | [Optional] [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Success |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## loadLoadIdAttachmentsLoadAttachmentTypePost

> loadLoadIdAttachmentsLoadAttachmentTypePost(loadId, loadAttachmentType, username, files)



Attach a specific type of file to a load (allowed file types - .bmp, .jpg, .jpeg, .png, .tif, .tiff, .pdf).

### Example

```ts
import {
  Configuration,
  LoadImageFileAttachmentsApi,
} from '@pcs/file-api';
import type { LoadLoadIdAttachmentsLoadAttachmentTypePostRequest } from '@pcs/file-api';

async function example() {
  console.log("🚀 Testing @pcs/file-api SDK...");
  const api = new LoadImageFileAttachmentsApi();

  const body = {
    // number
    loadId: 56,
    // 'BillOfLading' | 'DeliveryReceipt' | 'Interchange' | 'LoadReceipt' | 'PurchaseOrder' | 'PackingSlip' | 'ScaleTicket' | 'TransportAgreement' | 'WorkOrder' | 'OtherReceipt' | 'OtherBackup'
    loadAttachmentType: loadAttachmentType_example,
    // string | Must be a valid TMS user which will be recorded as the user performing the operation. (optional)
    username: username_example,
    // Array<Blob> (optional)
    files: /path/to/file.txt,
  } satisfies LoadLoadIdAttachmentsLoadAttachmentTypePostRequest;

  try {
    const data = await api.loadLoadIdAttachmentsLoadAttachmentTypePost(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **loadId** | `number` |  | [Defaults to `undefined`] |
| **loadAttachmentType** | `BillOfLading`, `DeliveryReceipt`, `Interchange`, `LoadReceipt`, `PurchaseOrder`, `PackingSlip`, `ScaleTicket`, `TransportAgreement`, `WorkOrder`, `OtherReceipt`, `OtherBackup` |  | [Defaults to `undefined`] [Enum: BillOfLading, DeliveryReceipt, Interchange, LoadReceipt, PurchaseOrder, PackingSlip, ScaleTicket, TransportAgreement, WorkOrder, OtherReceipt, OtherBackup] |
| **username** | `string` | Must be a valid TMS user which will be recorded as the user performing the operation. | [Optional] [Defaults to `undefined`] |
| **files** | `Array<Blob>` |  | [Optional] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Success |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

