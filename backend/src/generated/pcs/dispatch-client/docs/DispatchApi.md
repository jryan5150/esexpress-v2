# DispatchApi

All URIs are relative to *https://api.pcssoft.com/api*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**brokerDispatchGet**](DispatchApi.md#brokerdispatchget) | **GET** /broker/dispatch |  |
| [**companyDispatchGet**](DispatchApi.md#companydispatchget) | **GET** /company/dispatch |  |
| [**truckloadLoadIdBrokerDispatchPost**](DispatchApi.md#truckloadloadidbrokerdispatchpost) | **POST** /truckload/{loadId}/broker/dispatch |  |
| [**truckloadLoadIdCompanyDispatchPost**](DispatchApi.md#truckloadloadidcompanydispatchpost) | **POST** /truckload/{loadId}/company/dispatch |  |
| [**truckloadLoadIdCompanyReservePost**](DispatchApi.md#truckloadloadidcompanyreservepost) | **POST** /truckload/{loadId}/company/reserve |  |



## brokerDispatchGet

> Array&lt;CarrierDispatchRecord&gt; brokerDispatchGet(status, payType, fromDate, toDate, fromLoadNumber, toLoadNumber, carrierName, customerId)



### Example

```ts
import {
  Configuration,
  DispatchApi,
} from '@pcs/dispatch-api';
import type { BrokerDispatchGetRequest } from '@pcs/dispatch-api';

async function example() {
  console.log("🚀 Testing @pcs/dispatch-api SDK...");
  const api = new DispatchApi();

  const body = {
    // string (optional)
    status: status_example,
    // string (optional)
    payType: payType_example,
    // Date (optional)
    fromDate: 2013-10-20T19:20:30+01:00,
    // Date (optional)
    toDate: 2013-10-20T19:20:30+01:00,
    // number (optional)
    fromLoadNumber: 56,
    // number (optional)
    toLoadNumber: 56,
    // string (optional)
    carrierName: carrierName_example,
    // string | Pcs client id (customer id) (optional)
    customerId: customerId_example,
  } satisfies BrokerDispatchGetRequest;

  try {
    const data = await api.brokerDispatchGet(body);
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
| **status** | `string` |  | [Optional] [Defaults to `undefined`] |
| **payType** | `string` |  | [Optional] [Defaults to `undefined`] |
| **fromDate** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **toDate** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **fromLoadNumber** | `number` |  | [Optional] [Defaults to `undefined`] |
| **toLoadNumber** | `number` |  | [Optional] [Defaults to `undefined`] |
| **carrierName** | `string` |  | [Optional] [Defaults to `undefined`] |
| **customerId** | `string` | Pcs client id (customer id) | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;CarrierDispatchRecord&gt;**](CarrierDispatchRecord.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `text/plain`, `application/json`, `text/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## companyDispatchGet

> Array&lt;LoadDispatch&gt; companyDispatchGet(status, payType, fromDate, toDate, fromLoadNumber, toLoadNumber, driverName, customerId)



### Example

```ts
import {
  Configuration,
  DispatchApi,
} from '@pcs/dispatch-api';
import type { CompanyDispatchGetRequest } from '@pcs/dispatch-api';

async function example() {
  console.log("🚀 Testing @pcs/dispatch-api SDK...");
  const api = new DispatchApi();

  const body = {
    // string (optional)
    status: status_example,
    // string (optional)
    payType: payType_example,
    // Date (optional)
    fromDate: 2013-10-20T19:20:30+01:00,
    // Date (optional)
    toDate: 2013-10-20T19:20:30+01:00,
    // number (optional)
    fromLoadNumber: 56,
    // number (optional)
    toLoadNumber: 56,
    // string (optional)
    driverName: driverName_example,
    // string | Pcs client id (customer id) (optional)
    customerId: customerId_example,
  } satisfies CompanyDispatchGetRequest;

  try {
    const data = await api.companyDispatchGet(body);
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
| **status** | `string` |  | [Optional] [Defaults to `undefined`] |
| **payType** | `string` |  | [Optional] [Defaults to `undefined`] |
| **fromDate** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **toDate** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **fromLoadNumber** | `number` |  | [Optional] [Defaults to `undefined`] |
| **toLoadNumber** | `number` |  | [Optional] [Defaults to `undefined`] |
| **driverName** | `string` |  | [Optional] [Defaults to `undefined`] |
| **customerId** | `string` | Pcs client id (customer id) | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;LoadDispatch&gt;**](LoadDispatch.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `text/plain`, `application/json`, `text/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## truckloadLoadIdBrokerDispatchPost

> truckloadLoadIdBrokerDispatchPost(loadId, username, truckLoadCarrierAssignment)



### Example

```ts
import {
  Configuration,
  DispatchApi,
} from '@pcs/dispatch-api';
import type { TruckloadLoadIdBrokerDispatchPostRequest } from '@pcs/dispatch-api';

async function example() {
  console.log("🚀 Testing @pcs/dispatch-api SDK...");
  const api = new DispatchApi();

  const body = {
    // number
    loadId: 56,
    // string | Must be a valid TMS user which will be recorded as the user performing the operation. (optional)
    username: username_example,
    // TruckLoadCarrierAssignment (optional)
    truckLoadCarrierAssignment: ...,
  } satisfies TruckloadLoadIdBrokerDispatchPostRequest;

  try {
    const data = await api.truckloadLoadIdBrokerDispatchPost(body);
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
| **truckLoadCarrierAssignment** | [TruckLoadCarrierAssignment](TruckLoadCarrierAssignment.md) |  | [Optional] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`, `text/json`, `application/*+json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Success |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## truckloadLoadIdCompanyDispatchPost

> truckloadLoadIdCompanyDispatchPost(loadId, username, truckLoadAssignment)



### Example

```ts
import {
  Configuration,
  DispatchApi,
} from '@pcs/dispatch-api';
import type { TruckloadLoadIdCompanyDispatchPostRequest } from '@pcs/dispatch-api';

async function example() {
  console.log("🚀 Testing @pcs/dispatch-api SDK...");
  const api = new DispatchApi();

  const body = {
    // number
    loadId: 56,
    // string | Must be a valid TMS user which will be recorded as the user performing the operation. (optional)
    username: username_example,
    // TruckLoadAssignment (optional)
    truckLoadAssignment: ...,
  } satisfies TruckloadLoadIdCompanyDispatchPostRequest;

  try {
    const data = await api.truckloadLoadIdCompanyDispatchPost(body);
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
| **truckLoadAssignment** | [TruckLoadAssignment](TruckLoadAssignment.md) |  | [Optional] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`, `text/json`, `application/*+json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Success |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## truckloadLoadIdCompanyReservePost

> truckloadLoadIdCompanyReservePost(loadId, username, truckLoadAssignment)



### Example

```ts
import {
  Configuration,
  DispatchApi,
} from '@pcs/dispatch-api';
import type { TruckloadLoadIdCompanyReservePostRequest } from '@pcs/dispatch-api';

async function example() {
  console.log("🚀 Testing @pcs/dispatch-api SDK...");
  const api = new DispatchApi();

  const body = {
    // number
    loadId: 56,
    // string | Must be a valid TMS user which will be recorded as the user performing the operation. (optional)
    username: username_example,
    // TruckLoadAssignment (optional)
    truckLoadAssignment: ...,
  } satisfies TruckloadLoadIdCompanyReservePostRequest;

  try {
    const data = await api.truckloadLoadIdCompanyReservePost(body);
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
| **truckLoadAssignment** | [TruckLoadAssignment](TruckLoadAssignment.md) |  | [Optional] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`, `text/json`, `application/*+json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Success |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

