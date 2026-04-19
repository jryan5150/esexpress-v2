# TokensApi

All URIs are relative to *https://api.pcssoft.com/authorization/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**tokensGet**](TokensApi.md#tokensget) | **GET** /tokens | Retrieves an access token for the specified client application |
| [**tokensOauthPost**](TokensApi.md#tokensoauthpost) | **POST** /tokens/oauth | Retrieves an access token for the specified client application using the standard OAuth endpoint |
| [**tokensPost**](TokensApi.md#tokenspost) | **POST** /tokens | Retrieves an access token for the specified client application |



## tokensGet

> ClientToken tokensGet(applicationId, applicationSecret)

Retrieves an access token for the specified client application

### Example

```ts
import {
  Configuration,
  TokensApi,
} from '';
import type { TokensGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TokensApi();

  const body = {
    // string | The unique identifier of the client application (optional)
    applicationId: applicationId_example,
    // string | The provisioned client secret for authentication (optional)
    applicationSecret: applicationSecret_example,
  } satisfies TokensGetRequest;

  try {
    const data = await api.tokensGet(body);
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
| **applicationId** | `string` | The unique identifier of the client application | [Optional] [Defaults to `undefined`] |
| **applicationSecret** | `string` | The provisioned client secret for authentication | [Optional] [Defaults to `undefined`] |

### Return type

[**ClientToken**](ClientToken.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `text/plain`, `application/json`, `text/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## tokensOauthPost

> OauthTokenResponse tokensOauthPost(grantType, clientId, clientSecret)

Retrieves an access token for the specified client application using the standard OAuth endpoint

### Example

```ts
import {
  Configuration,
  TokensApi,
} from '';
import type { TokensOauthPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TokensApi();

  const body = {
    // string
    grantType: grantType_example,
    // string
    clientId: clientId_example,
    // string
    clientSecret: clientSecret_example,
  } satisfies TokensOauthPostRequest;

  try {
    const data = await api.tokensOauthPost(body);
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
| **grantType** | `string` |  | [Defaults to `undefined`] |
| **clientId** | `string` |  | [Defaults to `undefined`] |
| **clientSecret** | `string` |  | [Defaults to `undefined`] |

### Return type

[**OauthTokenResponse**](OauthTokenResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/x-www-form-urlencoded`
- **Accept**: `text/plain`, `application/json`, `text/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## tokensPost

> ClientToken tokensPost(appCredentialModel)

Retrieves an access token for the specified client application

### Example

```ts
import {
  Configuration,
  TokensApi,
} from '';
import type { TokensPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TokensApi();

  const body = {
    // AppCredentialModel (optional)
    appCredentialModel: ...,
  } satisfies TokensPostRequest;

  try {
    const data = await api.tokensPost(body);
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
| **appCredentialModel** | [AppCredentialModel](AppCredentialModel.md) |  | [Optional] |

### Return type

[**ClientToken**](ClientToken.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`, `text/json`, `application/*+json`
- **Accept**: `text/plain`, `application/json`, `text/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

