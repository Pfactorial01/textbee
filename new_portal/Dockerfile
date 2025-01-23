
FROM python:3.9


WORKDIR /code1

EXPOSE 8000
COPY ./requirements.txt /code1/requirements.txt


RUN pip install --no-cache-dir --upgrade -r /code1/requirements.txt


COPY . /code1


CMD ["python", "main.py"]