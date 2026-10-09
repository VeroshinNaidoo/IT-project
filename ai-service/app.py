from fastapi import FastAPI
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="EduQuest Mock AI Service")


class Option(BaseModel):
    option_text: str = Field(min_length=1)
    is_correct: bool


class Question(BaseModel):
    question_text: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    marks: float = Field(gt=0)
    options: list[Option] = Field(min_length=2, max_length=6)

    @field_validator("options")
    @classmethod
    def exactly_one_correct_and_no_duplicates(cls, value: list[Option]) -> list[Option]:
        if sum(option.is_correct for option in value) != 1:
            raise ValueError("exactly one option must be correct")
        if len({option.option_text.casefold() for option in value}) != len(value):
            raise ValueError("option text must be unique")
        return value


class QuizRequest(BaseModel):
    extracted_text: str = Field(min_length=1)
    question_count: int = Field(default=5, ge=1, le=50)
    difficulty: str = Field(default="mixed", min_length=1)


class QuizResponse(BaseModel):
    title: str
    questions: list[Question] = Field(min_length=1)


class MiniScopeRequest(BaseModel):
    extracted_text: str = Field(min_length=1)
    topics: list[str] = Field(min_length=1)


class MiniScopeResponse(BaseModel):
    summaries: dict[str, str]


class AnalysisRequest(BaseModel):
    topic_statistics: list[dict[str, float | str]]


class AnalysisResponse(BaseModel):
    summary: str


@app.post("/generate-quiz", response_model=QuizResponse)
def generate_quiz(request: QuizRequest) -> QuizResponse:
    # MockProvider is deterministic and treats extracted text as data, never instructions.
    return QuizResponse(title="Revision quiz", questions=[Question(question_text=f"What is a key idea from the supplied material?", topic="General", marks=1, options=[Option(option_text="The supplied material's main concept", is_correct=True), Option(option_text="An unrelated concept", is_correct=False)]) for _ in range(request.question_count)])


@app.post("/generate-mini-scope", response_model=MiniScopeResponse)
def generate_mini_scope(request: MiniScopeRequest) -> MiniScopeResponse:
    return MiniScopeResponse(summaries={topic: f"Review the core ideas about {topic}." for topic in request.topics})


@app.post("/generate-analysis", response_model=AnalysisResponse)
def generate_analysis(request: AnalysisRequest) -> AnalysisResponse:
    weakest = min(request.topic_statistics, key=lambda item: float(item.get("correctness_percentage", 100)), default=None)
    topic = weakest.get("topic", "the reported topics") if weakest else "the reported topics"
    return AnalysisResponse(summary=f"Focus revision on {topic}.")
