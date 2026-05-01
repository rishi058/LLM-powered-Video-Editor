from fastapi import APIRouter
from models.ai_schema import Message, FunctionCallResponse
from services.ai.ai_service import generate_ai_response

router = APIRouter()

@router.post("/ai", response_model=FunctionCallResponse)
async def process_ai_message(request: Message):
    return await generate_ai_response(request)
