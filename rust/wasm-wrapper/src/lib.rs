use wasm_bindgen::prelude::*;
use edgework_sdk::{apis, models};

#[wasm_bindgen]
pub struct GatewayClient {
    base_path: String,
    bearer_token: Option<String>,
}

#[wasm_bindgen]
impl GatewayClient {
    #[wasm_bindgen(constructor)]
    pub fn new(base_path: &str, token: &str) -> GatewayClient {
        GatewayClient {
            base_path: base_path.to_string(),
            bearer_token: if token.is_empty() { None } else { Some(token.to_string()) },
        }
    }

    fn get_config(&self) -> apis::configuration::Configuration {
        let mut config = apis::configuration::Configuration::new();
        config.base_path = self.base_path.clone();
        config.bearer_access_token = self.bearer_token.clone();
        config
    }

    pub async fn create_chat_completion(&self, request: JsValue, request_id: Option<String>, correlation_id: Option<String>) -> Result<JsValue, JsValue> {
        let req: models::ChatCompletionRequest = serde_wasm_bindgen::from_value(request)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;
        
        let config = self.get_config();
        
        let rid = request_id.as_deref();
        let cid = correlation_id.as_deref();

        let result = apis::chat_completions_api::create_chat_completion(&config, req, rid, cid).await
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
            
        Ok(serde_wasm_bindgen::to_value(&result)?)
    }

    pub async fn health_check(&self) -> Result<JsValue, JsValue> {
        let config = self.get_config();
        let result = apis::health_api::get_health(&config).await
             .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(serde_wasm_bindgen::to_value(&result)?)
    }
}
