# Stand-in for the few PySide6.QtCore names KCC's command-line path imports. KCC's Docker image does
# not install PySide6, but comic2ebook imports it for GUI translations; on the command line every
# translate call returns its source text.


class QCoreApplication:
    @staticmethod
    def translate(context, text, disambiguation=None, n=-1):
        return text

    @staticmethod
    def instance():
        return None


class QTranslator:
    def load(self, *args, **kwargs):
        return False


def qVersion():
    return "6.0.0"
