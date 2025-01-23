from fastapi import FastAPI, Request, Form, Depends, HTTPException, status
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
import httpx
import uvicorn

# Initialize FastAPI app
app = FastAPI(title="SMS Portal")

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize Jinja2 templates
templates = Jinja2Templates(directory="templates")

# Backend API configuration
BACKEND_URL = "http://127.0.0.1:3005/api/v1"

# Authentication middleware
async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    username =  request.cookies.get("username")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            headers={"Location": "/login"}
        )
    return {"access_token": token, "username": username}

# Authentication routes
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "title": "Login"}
    )

@app.post("/login")
async def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...)
):
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BACKEND_URL}/auth/login",
                json={
                    "email": email,
                    "password": password
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                access_token = data["data"].get("accessToken")
                user = data["data"].get("user")
                
                resp = RedirectResponse(
                    url="/",
                    status_code=status.HTTP_302_FOUND
                )
                resp.set_cookie(
                    key="access_token",
                    value=access_token,
                    httponly=True,
                    max_age=3600 * 24  # 24 hours
                )
                resp.set_cookie(
                    key="client_access_token",
                    value=access_token,
                    max_age=3600 * 24  # 24 hours
                )
                resp.set_cookie(
                    key="username",
                    value=user["name"],
                    httponly=True,
                    max_age=3600 * 24  # 24 hours
                )
                return resp
            else:
                return templates.TemplateResponse(
                    "login.html",
                    {
                        "request": request,
                        "error": "Invalid credentials",
                        "title": "Login"
                    }
                )
        except Exception as e:
            return templates.TemplateResponse(
                "login.html",
                {
                    "request": request,
                    "error": f"Login failed: {str(e)}",
                    "title": "Login"
                }
            )

@app.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    return templates.TemplateResponse(
        "signup.html",
        {"request": request, "title": "Sign Up"}
    )

@app.post("/signup")
async def signup(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    confirm_password: str = Form(...)
):
    if password != confirm_password:
        return templates.TemplateResponse(
            "signup.html",
            {
                "request": request,
                "error": "Passwords do not match",
                "title": "Sign Up"
            }
        )
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BACKEND_URL}/auth/register",
                json={
                    "name": name,
                    "email": email,
                    "password": password
                }
            )
            if response.status_code == 201:
                data = response.json()
                access_token = data["data"].get("accessToken")
                user = data["data"].get("user")
                
                resp = RedirectResponse(
                    url="/",
                    status_code=status.HTTP_302_FOUND
                )
                resp.set_cookie(
                    key="access_token",
                    value=access_token,
                    httponly=True,
                    max_age=3600 * 24  # 24 hours
                )
                resp.set_cookie(
                    key="client_access_token",
                    value=access_token,
                    max_age=3600 * 24  # 24 hours
                )
                resp.set_cookie(
                    key="username",
                    value=user["name"],
                    httponly=True,
                    max_age=3600 * 24  # 24 hours
                )
                return resp
            else:
                error_data = response.json()
                return templates.TemplateResponse(
                    "signup.html",
                    {
                        "request": request,
                        "error": error_data.get("message", "Signup failed"),
                        "title": "Sign Up"
                    }
                )
        except Exception as e:
            return templates.TemplateResponse(
                "signup.html",
                {
                    "request": request,
                    "error": f"Signup failed: {str(e)}",
                    "title": "Sign Up"
                }
            )

@app.get("/logout")
async def logout():
    response = RedirectResponse(
        url="/login",
        status_code=status.HTTP_302_FOUND
    )
    response.delete_cookie("access_token")
    return response

# Add this function to get devices from the API
async def fetch_devices(access_token: str):
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{BACKEND_URL}/gateway/devices",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception as e:
            print(f"Error fetching devices: {str(e)}")
            return []

# Protected routes
@app.get("/", response_class=HTMLResponse)
async def home(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "title": "SMS Portal", "user": user, "devices": devices["data"]}
    )

@app.get("/messages", response_class=HTMLResponse)
async def view_messages(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    messages = []  # This should be populated from your backend
    return templates.TemplateResponse(
        "messages.html",
        {
            "request": request,
            "messages": messages,
            "title": "View Messages",
            "user": user,
            "devices": devices["data"]
        }
    )

@app.get("/send", response_class=HTMLResponse)
async def send_message_form(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    return templates.TemplateResponse(
        "send.html",
        {"request": request, "title": "Send Message", "user": user, "devices": devices["data"]}
    )

@app.post("/send")
async def send_message(
    request: Request,
    phone_number: str = Form(...),
    message: str = Form(...),
    user=Depends(get_current_user)
):
    devices = await fetch_devices(user["access_token"])
    try:
        # Add your backend API call here
        success = True
        message = "Message sent successfully!"
    except Exception as e:
        success = False
        message = f"Error sending message: {str(e)}"
    
    return templates.TemplateResponse(
        "send.html",
        {
            "request": request,
            "success": success,
            "message": message,
            "title": "Send Message",
            "user": user,
            "devices": devices["data"]
        }
    )

@app.get("/chat", response_class=HTMLResponse)
async def chat(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    return templates.TemplateResponse(
        "chat.html",
        {"request": request, "title": "Chat/Text", "user": user, "devices": devices["data"]}
    )

@app.get("/scraper", response_class=HTMLResponse)
async def scraper(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    return templates.TemplateResponse(
        "scraper.html",
        {"request": request, "title": "Web Scraper", "user": user, "devices": devices["data"]}
    )

@app.get("/proxy", response_class=HTMLResponse)
async def proxy(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    return templates.TemplateResponse(
        "proxy.html",
        {"request": request, "title": "Proxy Server", "user": user, "devices": devices["data"]}
    )

@app.get("/settings", response_class=HTMLResponse)
async def settings(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    return templates.TemplateResponse(
        "settings.html",
        {"request": request, "title": "Phone Settings", "user": user, "devices": devices["data"]}
    )

@app.get("/logs", response_class=HTMLResponse)
async def logs(request: Request, user=Depends(get_current_user)):
    devices = await fetch_devices(user["access_token"])
    return templates.TemplateResponse(
        "logs.html",
        {"request": request, "title": "Audit", "user": user, "devices": devices["data"]}
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
