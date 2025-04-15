if __name__ == "__main__":
    from pyminion.expansions import base, intrigue # alchemy and seaside not working on pypi version
    from pyminion.game import Game
    from pyminion.bots.examples import BigMoney
    from pyminion.human import Human

    # Initialize human and bot
    human = Human()
    bot = BigMoney()

    # Setup the game
    game = Game(players=[human, bot], expansions=[base.base_set, intrigue.intrigue_set])

    # Play game
    game.play()