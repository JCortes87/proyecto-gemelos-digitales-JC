from app.db.base import Base
from app.db.models import Course, Student, Enrollment, GradeItem, DropboxFolder, OutcomeSet
from app.db.session import engine

#|---- Este método lo modifiqué temporalmente para reinicializar la db -----|
def init_db() -> None:
    #|---------- Este drop.all es opcional para reinicializar la base pero se quitará más adelante ------|
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Base de datos reinicializada correctamente.")


if __name__ == "__main__":
    init_db()